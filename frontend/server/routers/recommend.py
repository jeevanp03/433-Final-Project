"""
Recommendation and SHAP explanation endpoints.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from server.deps import (
    get_conformal_widths,
    get_features,
    get_shap_values,
    get_target_column,
    get_xgb_model,
)
from server.schemas import (
    ExplainResponse,
    FlexibleLoadInput,
    RecommendRequest,
    RecommendResponse,
    ScheduleEntry,
    ShapDriver,
)

router = APIRouter(tags=["recommend"])


# ---------------------------------------------------------------------------
# POST /api/recommend
# ---------------------------------------------------------------------------

@router.post("/recommend", response_model=RecommendResponse)
def create_recommendation(req: RecommendRequest):
    """Run load-shift optimisation and return recommendations."""
    from src.prescriptive.constraints import FlexibleLoad, get_default_loads
    from src.prescriptive.optimiser import optimise
    from src.prescriptive.pricing import build_hourly_price_vector, get_tou_rate

    features = get_features()
    target = get_target_column()

    # Get forecast profile for the origin
    if req.forecast_origin:
        origin_ts = pd.Timestamp(req.forecast_origin)
        idx = features.index.get_indexer([origin_ts], method="nearest")[0]
    else:
        idx = len(features) - 1

    X_row = features.iloc[[idx]].drop(columns=[target], errors="ignore")
    model = get_xgb_model()
    forecast_24 = model.predict(X_row)[0]  # shape (24,)

    # Build loads
    if req.loads:
        loads = [
            FlexibleLoad(
                name=l.name,
                duration_h=l.duration_h,
                power_kw=l.power_kw,
                earliest_start=l.earliest_start,
                latest_finish=l.latest_finish,
                preemptable=l.preemptable,
                max_deferral_h=l.max_deferral_h,
                original_start=l.original_start,
            )
            for l in req.loads
        ]
    else:
        loads = get_default_loads()

    result = optimise(forecast_24, loads=loads, peak_weight=req.peak_weight)

    # Build per-appliance recommendation entries
    prices = build_hourly_price_vector(24)
    recommendations = []
    for load in loads:
        opt_start = result.schedule.get(load.name)
        if opt_start is None:
            continue

        orig = load.original_start
        if orig is not None and opt_start != orig:
            # Cost at original vs optimised
            orig_cost = sum(
                load.power_kw * prices[(orig + d) % 24]
                for d in range(load.duration_h)
            )
            opt_cost = sum(
                load.power_kw * prices[(opt_start + d) % 24]
                for d in range(load.duration_h)
            )
            savings = orig_cost - opt_cost
            shift_desc = f"Shift from {orig:02d}:00 to {opt_start:02d}:00"
        else:
            savings = 0.0
            shift_desc = f"Schedule at {opt_start:02d}:00"

        recommendations.append(
            ScheduleEntry(
                appliance=load.name,
                start_hour=opt_start,
                power_kw=load.power_kw,
                duration_h=load.duration_h,
                savings_cost=round(savings, 4),
                shift_description=shift_desc,
            )
        )

    return RecommendResponse(
        feasible=result.feasible,
        schedule=result.schedule,
        baseline_profile=[round(float(v), 4) for v in result.baseline_profile],
        optimised_profile=[round(float(v), 4) for v in result.optimised_profile],
        peak_reduction_kw=round(result.peak_reduction_kw, 4),
        peak_reduction_pct=round(result.peak_reduction_pct, 2),
        cost_change_eur=round(result.cost_change_eur, 4),
        cost_change_pct=round(result.cost_change_pct, 2),
        relaxation_steps=result.relaxation_steps,
        recommendations=recommendations,
    )


# ---------------------------------------------------------------------------
# GET /api/recommend (get current recommendations with defaults)
# ---------------------------------------------------------------------------

@router.get("/recommend", response_model=RecommendResponse)
def get_recommendations():
    """Get recommendations with default loads and latest forecast."""
    return create_recommendation(RecommendRequest())


# ---------------------------------------------------------------------------
# GET /api/explain
# ---------------------------------------------------------------------------

@router.get("/explain", response_model=ExplainResponse)
def get_explanation(
    hour: int = Query(default=0, ge=0, le=23, description="Hour to explain (0-23)"),
    origin: str | None = Query(default=None, description="ISO datetime origin"),
):
    """SHAP-based explanation for a specific forecast hour."""
    from src.models.explain import get_top_drivers
    from src.skills.nl_explainer import explain_shap_drivers

    features = get_features()
    shap_df = get_shap_values()

    # Resolve origin
    if origin:
        origin_ts = pd.Timestamp(origin)
        if origin_ts not in shap_df.index:
            idx = shap_df.index.get_indexer([origin_ts], method="nearest")[0]
            origin_ts = shap_df.index[idx]
    else:
        origin_ts = shap_df.index[-1]

    # Get row index relative to hour offset
    # SHAP was computed on h=1 model, so use origin + hour offset
    target_idx = shap_df.index.get_loc(origin_ts)
    adjusted_idx = min(target_idx + hour, len(shap_df) - 1)
    row_ts = shap_df.index[adjusted_idx]

    top_drivers = get_top_drivers(shap_df, row_ts, n=5)
    narrative = explain_shap_drivers(top_drivers)

    return ExplainResponse(
        drivers=[ShapDriver(**d) for d in top_drivers],
        narrative=narrative,
        hour=hour,
        origin=str(origin_ts),
    )
