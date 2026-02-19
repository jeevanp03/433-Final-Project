"""
Forecast, status, history, backtest, and decomposition endpoints.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from server.deps import (
    get_backtest_results,
    get_conformal_widths,
    get_features,
    get_hourly_data,
    get_ridge_model,
    get_target_column,
    get_test_metrics,
    get_validation_metrics,
    get_xgb_model,
)
from server.schemas import (
    BacktestPoint,
    BacktestResponse,
    DecompositionResponse,
    ForecastPoint,
    ForecastResponse,
    HistoryPoint,
    HistoryResponse,
    StatusResponse,
)

router = APIRouter(tags=["forecast"])


# ---------------------------------------------------------------------------
# GET /api/status
# ---------------------------------------------------------------------------

@router.get("/status", response_model=StatusResponse)
def get_status():
    """Current household status: latest draw, today's total, estimated cost, forecast peak."""
    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    hourly = get_hourly_data()
    target = get_target_column()

    # Latest available hour
    latest = hourly.iloc[-1]
    current_kw = float(latest[target])

    # Today's total (last 24 hours)
    last_24 = hourly[target].iloc[-24:]
    today_kwh = float(last_24.sum())

    # Estimated cost
    prices = build_hourly_price_vector(24)
    estimated_cost = compute_cost(last_24.values, prices)

    # Forecast peak (from XGBoost, last available origin)
    features = get_features()
    model = get_xgb_model()
    X_last = features.iloc[[-1]].drop(columns=[target], errors="ignore")
    preds = model.predict(X_last)[0]  # shape (24,)
    peak_idx = int(np.argmax(preds))
    forecast_peak_kw = float(preds[peak_idx])

    # Peak hour as readable string
    origin_ts = features.index[-1]
    peak_hour = str(origin_ts + pd.Timedelta(hours=peak_idx + 1))

    # Alert if peak > 2.5 kW (configurable threshold)
    alert = forecast_peak_kw > 2.5

    return StatusResponse(
        current_kw=round(current_kw, 3),
        today_kwh=round(today_kwh, 2),
        estimated_cost=round(estimated_cost, 2),
        forecast_peak_kw=round(forecast_peak_kw, 3),
        forecast_peak_hour=peak_hour,
        alert=alert,
    )


# ---------------------------------------------------------------------------
# GET /api/forecast
# ---------------------------------------------------------------------------

@router.get("/forecast", response_model=ForecastResponse)
def get_forecast(
    model: Literal["xgboost", "ridge", "naive"] = "xgboost",
    horizon: int = Query(default=24, ge=1, le=168),
    origin: str | None = Query(default=None, description="ISO datetime origin"),
    confidence: int = Query(default=90, ge=50, le=99),
):
    """Generate forecast from a given origin with prediction intervals."""
    from src.models.conformal import apply_intervals

    features = get_features()
    target = get_target_column()
    hourly = get_hourly_data()

    # Resolve origin
    if origin:
        try:
            origin_ts = pd.Timestamp(origin)
        except ValueError:
            raise HTTPException(400, f"Invalid origin datetime: {origin}")
        if origin_ts not in features.index:
            # Find nearest
            idx = features.index.get_indexer([origin_ts], method="nearest")[0]
            origin_ts = features.index[idx]
    else:
        origin_ts = features.index[-1]

    origin_idx = features.index.get_loc(origin_ts)
    X_row = features.iloc[[origin_idx]].drop(columns=[target], errors="ignore")

    # Clamp horizon to 24 for direct models (they produce 24 steps)
    model_horizon = min(horizon, 24)

    if model == "naive":
        # Seasonal naive: use lag_168h value for all horizons
        lag_col = "lag_168h"
        if lag_col in X_row.columns:
            naive_val = float(X_row[lag_col].iloc[0])
        else:
            naive_val = float(hourly[target].iloc[origin_idx - 168])
        point = np.full(model_horizon, naive_val)
        widths = get_conformal_widths()
        width_arr = np.array(
            [widths.get(f"h{h}", 0.5) for h in range(1, model_horizon + 1)]
        )
        lower = point - width_arr
        upper = point + width_arr
    else:
        forecaster = get_xgb_model() if model == "xgboost" else get_ridge_model()
        preds_2d = forecaster.predict(X_row)  # (1, 24)
        point = preds_2d[0, :model_horizon]
        widths = get_conformal_widths()
        width_arr = np.array(
            [widths.get(f"h{h}", 0.3) for h in range(1, model_horizon + 1)]
        )
        lower = point - width_arr
        upper = point + width_arr

    # Build response points with actuals where available
    points = []
    for h in range(model_horizon):
        ts = origin_ts + pd.Timedelta(hours=h + 1)
        actual = None
        future_idx = origin_idx + h + 1
        if future_idx < len(hourly):
            actual = float(hourly[target].iloc[future_idx])
        points.append(
            ForecastPoint(
                timestamp=str(ts),
                actual=actual,
                forecast=round(float(point[h]), 4),
                lower=round(float(lower[h]), 4),
                upper=round(float(upper[h]), 4),
            )
        )

    return ForecastResponse(
        model=model,
        horizon=model_horizon,
        origin=str(origin_ts),
        points=points,
    )


# ---------------------------------------------------------------------------
# GET /api/history
# ---------------------------------------------------------------------------

@router.get("/history", response_model=HistoryResponse)
def get_history(
    start: str | None = Query(default=None, alias="from", description="ISO start date"),
    end: str | None = Query(default=None, alias="to", description="ISO end date"),
    granularity: Literal["hour", "day", "week", "month"] = "hour",
    meter: Literal["total", "sub1", "sub2", "sub3", "other"] = "total",
):
    """Historical consumption data by date range and granularity."""
    hourly = get_hourly_data()
    target = get_target_column()

    meter_col_map = {
        "total": target,
        "sub1": "Sub_metering_1",
        "sub2": "Sub_metering_2",
        "sub3": "Sub_metering_3",
        "other": "Other_consumption",
    }
    col = meter_col_map.get(meter, target)
    if col not in hourly.columns:
        raise HTTPException(400, f"Meter '{meter}' not available")

    series = hourly[col]

    # Filter date range
    if start:
        series = series[series.index >= pd.Timestamp(start)]
    if end:
        series = series[series.index <= pd.Timestamp(end)]

    # Resample
    if granularity == "day":
        series = series.resample("D").mean()
    elif granularity == "week":
        series = series.resample("W").mean()
    elif granularity == "month":
        series = series.resample("ME").mean()
    # hour = no resample needed

    # Limit to 2000 points max
    if len(series) > 2000:
        series = series.iloc[-2000:]

    points = [
        HistoryPoint(timestamp=str(ts), value=round(float(val), 4), meter=meter)
        for ts, val in series.items()
        if pd.notna(val)
    ]

    return HistoryResponse(points=points, granularity=granularity, meter=meter)


# ---------------------------------------------------------------------------
# GET /api/backtest
# ---------------------------------------------------------------------------

@router.get("/backtest", response_model=BacktestResponse)
def get_backtest(
    origin: str | None = Query(default=None, description="Filter by origin datetime"),
    model_name: Literal["xgboost", "ridge", "naive"] = "xgboost",
):
    """Backtest results for a given origin or summary."""
    bt = get_backtest_results()

    # Filter by model if column exists
    if "model" in bt.columns:
        bt = bt[bt["model"] == model_name]

    # Filter by origin
    if origin:
        origin_ts = pd.Timestamp(origin)
        bt = bt[bt["origin"] == origin_ts]

    if bt.empty:
        raise HTTPException(404, "No backtest results found for given filters")

    # Compute aggregate metrics
    from src.skills.metrics import mae, rmse

    metrics = {
        "mae": float(mae(bt["actual"].values, bt["predicted"].values)),
        "rmse": float(rmse(bt["actual"].values, bt["predicted"].values)),
        "n_origins": int(bt["origin"].nunique()) if "origin" in bt.columns else 0,
        "n_points": len(bt),
    }

    # Limit points for response
    sample = bt.head(500)
    points = [
        BacktestPoint(
            origin=str(row.get("origin", "")),
            horizon=int(row.get("horizon", 1)),
            actual=round(float(row["actual"]), 4),
            predicted=round(float(row["predicted"]), 4),
            residual=round(float(row["actual"] - row["predicted"]), 4),
            model=str(row.get("model", model_name)),
        )
        for _, row in sample.iterrows()
    ]

    return BacktestResponse(points=points, metrics=metrics)


# ---------------------------------------------------------------------------
# GET /api/decompose
# ---------------------------------------------------------------------------

@router.get("/decompose", response_model=DecompositionResponse)
def get_decomposition(
    start: str | None = Query(default=None, alias="from"),
    end: str | None = Query(default=None, alias="to"),
    period: int = Query(default=24, description="Seasonal period (24=daily, 168=weekly)"),
):
    """STL decomposition of the consumption time series."""
    from statsmodels.tsa.seasonal import STL

    hourly = get_hourly_data()
    target = get_target_column()
    series = hourly[target]

    if start:
        series = series[series.index >= pd.Timestamp(start)]
    if end:
        series = series[series.index <= pd.Timestamp(end)]

    # Limit length for performance
    if len(series) > 5000:
        series = series.iloc[-5000:]

    if len(series) < period * 2:
        raise HTTPException(400, f"Need at least {period * 2} points for period={period}")

    stl = STL(series, period=period)
    result = stl.fit()

    return DecompositionResponse(
        timestamps=[str(ts) for ts in result.trend.index],
        trend=[round(float(v), 4) for v in result.trend.values],
        seasonal=[round(float(v), 4) for v in result.seasonal.values],
        residual=[round(float(v), 4) for v in result.resid.values],
        period=period,
    )


# ---------------------------------------------------------------------------
# GET /api/metrics
# ---------------------------------------------------------------------------

@router.get("/metrics")
def get_metrics(split: Literal["validation", "test"] = "test"):
    """Model evaluation metrics."""
    if split == "validation":
        df = get_validation_metrics()
    else:
        df = get_test_metrics()
    return df.to_dict(orient="index")
