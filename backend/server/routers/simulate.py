"""
Simulation and sensitivity analysis endpoints.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from fastapi import APIRouter

from server.deps import (
    get_conformal_widths,
    get_features,
    get_target_column,
    get_xgb_model,
)
from server.schemas import (
    OutcomeDist,
    SensitivityBar,
    SensitivityRequest,
    SensitivityResponse,
    SimulateRequest,
    SimulateResponse,
)

router = APIRouter(tags=["simulate"])


# ---------------------------------------------------------------------------
# POST /api/simulate
# ---------------------------------------------------------------------------

@router.post("/simulate", response_model=SimulateResponse)
def run_simulation(req: SimulateRequest):
    """Run Monte Carlo simulation with scenario modifications."""
    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    features = get_features()
    target = get_target_column()
    model = get_xgb_model()

    horizon = min(req.horizon, 24)

    # Base forecast from latest origin
    X_last = features.iloc[[-1]].drop(columns=[target], errors="ignore")
    base_forecast = model.predict(X_last)[0, :horizon]

    # Apply scenario modifications to base forecast
    modified = base_forecast.copy()
    for block in req.blocks:
        modified = _apply_block(modified, block.type, block.params)

    # Get residual distribution from conformal widths
    widths = get_conformal_widths()
    width_arr = np.array(
        [widths.get(f"h{h}", 0.3) for h in range(1, horizon + 1)]
    )

    # Monte Carlo: sample from forecast +/- residual noise
    rng = np.random.default_rng(req.seed)
    n = req.mc_runs
    paths = np.zeros((n, horizon))
    for i in range(n):
        noise = rng.normal(0, width_arr / 1.645)  # 90% CI -> ~1.645 sigma
        paths[i] = np.maximum(modified + noise, 0)

    # Compute outcome distributions
    prices = build_hourly_price_vector(horizon)

    daily_kwh_samples = paths.sum(axis=1)
    peak_kw_samples = paths.max(axis=1)
    daily_cost_samples = np.array([compute_cost(p, prices) for p in paths])
    peak_risk_samples = (paths > 2.5).sum(axis=1).astype(float)

    def _dist(arr: np.ndarray) -> OutcomeDist:
        return OutcomeDist(
            mean=round(float(np.mean(arr)), 4),
            std=round(float(np.std(arr)), 4),
            p5=round(float(np.percentile(arr, 5)), 4),
            p95=round(float(np.percentile(arr, 95)), 4),
        )

    # Compute percentile bands for fan chart
    percentile_keys = [10, 25, 50, 75, 90]
    percentiles = {
        str(p): [round(float(v), 4) for v in np.percentile(paths, p, axis=0)]
        for p in percentile_keys
    }

    return SimulateResponse(
        daily_kwh=_dist(daily_kwh_samples),
        peak_kw=_dist(peak_kw_samples),
        daily_cost=_dist(daily_cost_samples),
        peak_risk_hours=_dist(peak_risk_samples),
        percentiles=percentiles,
    )


# ---------------------------------------------------------------------------
# POST /api/sensitivity
# ---------------------------------------------------------------------------

@router.post("/sensitivity", response_model=SensitivityResponse)
def run_sensitivity(req: SensitivityRequest):
    """Tornado sensitivity analysis: vary one parameter at a time."""
    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    features = get_features()
    target = get_target_column()
    model = get_xgb_model()

    X_last = features.iloc[[-1]].drop(columns=[target], errors="ignore")
    base_forecast = model.predict(X_last)[0, :24]
    prices = build_hourly_price_vector(24)

    # Apply base scenario
    base_modified = base_forecast.copy()
    for block in req.base_scenario:
        base_modified = _apply_block(base_modified, block.type, block.params)

    # Compute baseline metric
    baseline_value = _compute_metric(base_modified, prices, req.target_metric)

    # Default parameters to vary
    params_to_vary = req.parameters or [
        "scale_factor",
        "add_power_kw",
        "shift_hours",
        "occupancy_factor",
    ]

    bars = []
    for param in params_to_vary:
        low_mod = base_modified.copy()
        high_mod = base_modified.copy()

        if param == "scale_factor":
            low_mod *= 0.8
            high_mod *= 1.2
            low_val, high_val = 0.8, 1.2
        elif param == "add_power_kw":
            low_mod += 0.5
            high_mod += 2.0
            low_val, high_val = 0.5, 2.0
        elif param == "shift_hours":
            low_mod = np.roll(base_modified, -2)
            high_mod = np.roll(base_modified, 2)
            low_val, high_val = -2, 2
        elif param == "occupancy_factor":
            low_mod *= 0.7
            high_mod *= 1.3
            low_val, high_val = 0.7, 1.3
        else:
            continue

        bars.append(
            SensitivityBar(
                parameter=param,
                low_value=low_val,
                high_value=high_val,
                low_outcome=round(
                    _compute_metric(low_mod, prices, req.target_metric), 4
                ),
                high_outcome=round(
                    _compute_metric(high_mod, prices, req.target_metric), 4
                ),
            )
        )

    return SensitivityResponse(
        bars=bars,
        baseline_value=round(baseline_value, 4),
        metric=req.target_metric,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _apply_block(
    profile: np.ndarray,
    block_type: str,
    params: dict,
) -> np.ndarray:
    """Apply a scenario modification block to a forecast profile."""
    result = profile.copy()

    if block_type == "scale":
        factor = float(params.get("factor", 1.0))
        result *= factor
    elif block_type == "add_appliance":
        power = float(params.get("power_kw", 1.0))
        start = int(params.get("start_hour", 18))
        duration = int(params.get("duration_h", 2))
        for d in range(duration):
            h = (start + d) % len(result)
            result[h] += power
    elif block_type == "remove_appliance":
        power = float(params.get("power_kw", 1.0))
        start = int(params.get("start_hour", 18))
        duration = int(params.get("duration_h", 2))
        for d in range(duration):
            h = (start + d) % len(result)
            result[h] = max(0, result[h] - power)
    elif block_type == "shift":
        hours = int(params.get("hours", 0))
        result = np.roll(result, hours)
    elif block_type == "temperature_shock":
        factor = float(params.get("factor", 1.3))
        result *= factor
    elif block_type == "occupancy":
        factor = float(params.get("factor", 1.0))
        result *= factor
    elif block_type == "price_change":
        pass  # Price changes don't modify the load profile
    elif block_type == "battery_solar":
        capacity = float(params.get("capacity_kwh", 5.0))
        # Simple model: offset daytime hours
        solar_hours = range(8, 18)
        per_hour = capacity / len(list(solar_hours))
        for h in solar_hours:
            if h < len(result):
                result[h] = max(0, result[h] - per_hour)

    return result


def _compute_metric(
    profile: np.ndarray,
    prices: np.ndarray,
    metric: str,
) -> float:
    """Compute a single outcome metric from a load profile."""
    from src.prescriptive.pricing import compute_cost

    if metric == "daily_cost":
        return compute_cost(profile, prices)
    elif metric == "peak_kw":
        return float(np.max(profile))
    elif metric == "daily_kwh":
        return float(np.sum(profile))
    elif metric == "peak_risk_hours":
        return float((profile > 2.5).sum())
    return 0.0
