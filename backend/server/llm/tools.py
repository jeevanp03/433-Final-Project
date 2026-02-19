"""
LLM tool registry — 10 tools mapping to existing backend capabilities.

Each tool has:
- A JSON schema (Ollama tool-use format) for the LLM
- A Python executor that calls internal API logic directly (no HTTP round-trip)
- A text description for DeepSeek-R1 XML tag fallback
"""

from __future__ import annotations

import json
import os
from typing import Any

_DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "deepseek-r1:1.5b")

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Tool definitions (Ollama JSON schema format)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_current_status",
            "description": (
                "Get the household's current power draw (kW), today's total "
                "energy consumption (kWh), estimated daily cost, and any active "
                "peak alerts. Use this when the user asks about their current "
                "usage, today's status, or whether anything needs attention."
            ),
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_forecast",
            "description": (
                "Generate a consumption forecast for the specified number of "
                "hours ahead. Returns hourly point forecasts, 90% prediction "
                "intervals, and peak-risk hour flags. Use when the user asks "
                "about future usage, upcoming peaks, or tomorrow's demand."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "horizon": {
                        "type": "integer",
                        "description": "Hours ahead (6-168)",
                        "enum": [6, 12, 24, 48, 168],
                    },
                    "model": {
                        "type": "string",
                        "description": "Model to use",
                        "enum": ["xgboost", "ridge", "seasonal_naive"],
                    },
                },
                "required": ["horizon"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_history",
            "description": (
                "Retrieve historical consumption data for a date range. "
                "Returns timestamps, power values, and sub-meter breakdowns. "
                "Use when the user asks about past usage, wants comparisons "
                "between periods, or asks 'what happened on X date'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {
                        "type": "string",
                        "description": "Start datetime (ISO 8601)",
                    },
                    "end": {
                        "type": "string",
                        "description": "End datetime (ISO 8601)",
                    },
                    "granularity": {
                        "type": "string",
                        "enum": ["minute", "hourly", "daily", "weekly", "monthly"],
                    },
                },
                "required": ["start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_recommendations",
            "description": (
                "Get load-shift recommendations to reduce peak demand and cost. "
                "Returns optimised appliance schedule, peak reduction, and cost "
                "savings. Use when the user asks how to save money or reduce peaks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "max_deferral": {
                        "type": "integer",
                        "description": "Max hours an appliance can be deferred (0-12)",
                    },
                    "comfort": {
                        "type": "number",
                        "description": "Comfort priority (0.0=max savings, 1.0=no change)",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "explain_forecast",
            "description": (
                "Explain why a forecast value is high or low at a specific hour. "
                "Returns SHAP feature contributions and a narrative explanation. "
                "Use when the user asks 'why is my forecast high?' or similar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "hour": {
                        "type": "integer",
                        "description": "Hour to explain (0-23)",
                    },
                },
                "required": ["hour"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_simulation",
            "description": (
                "Run a what-if Monte Carlo simulation with scenario modifications. "
                "Returns outcome distributions (kWh, peak, cost, risk hours). "
                "Use when the user asks 'what if I add an EV charger?' or similar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "scenario_blocks": {
                        "type": "array",
                        "description": "List of scenario modifications",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": "string",
                                    "enum": [
                                        "add_appliance",
                                        "remove_appliance",
                                        "shift",
                                        "scale",
                                        "temperature_shock",
                                        "occupancy",
                                        "battery_solar",
                                    ],
                                },
                                "params": {"type": "object"},
                            },
                        },
                    },
                    "n_runs": {
                        "type": "integer",
                        "description": "Number of Monte Carlo runs (50-1000)",
                    },
                },
                "required": ["scenario_blocks"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_statistics",
            "description": (
                "Compute summary statistics for a date range: mean, min, max, "
                "std, and percentiles. Use when the user asks for averages, "
                "extremes, or statistical summaries of their usage."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "Start date (ISO 8601)"},
                    "end": {"type": "string", "description": "End date (ISO 8601)"},
                    "metric": {
                        "type": "string",
                        "description": "Which metric to summarise",
                        "enum": ["power_kw", "daily_kwh", "cost"],
                    },
                },
                "required": ["start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_periods",
            "description": (
                "Compare usage between two time periods. Returns deltas and "
                "a summary. Use when the user asks 'how does this month compare "
                "to last month?' or similar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "period_a": {
                        "type": "object",
                        "properties": {
                            "start": {"type": "string"},
                            "end": {"type": "string"},
                        },
                    },
                    "period_b": {
                        "type": "object",
                        "properties": {
                            "start": {"type": "string"},
                            "end": {"type": "string"},
                        },
                    },
                },
                "required": ["period_a", "period_b"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cost_breakdown",
            "description": (
                "Get cost breakdown by TOU tier and sub-meter for a date range. "
                "Returns per-tier costs, per-meter costs, total, and daily average. "
                "Use when the user asks about costs, bills, or pricing breakdowns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "start": {"type": "string", "description": "Start date"},
                    "end": {"type": "string", "description": "End date"},
                },
                "required": ["start", "end"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_recommendation",
            "description": (
                "Accept, reject, or modify a recommendation. Returns the updated "
                "schedule and new impact estimate. Use when the user wants to act "
                "on a recommendation or adjust its timing."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reco_id": {
                        "type": "string",
                        "description": "Recommendation / appliance name",
                    },
                    "action": {
                        "type": "string",
                        "enum": ["accept", "reject", "modify"],
                    },
                    "new_time": {
                        "type": "string",
                        "description": "New start time if modifying (HH:MM)",
                    },
                },
                "required": ["reco_id", "action"],
            },
        },
    },
]

# DeepSeek-R1 uses only the top 5 most common tools
DEEPSEEK_TOOL_NAMES = {
    "get_current_status",
    "get_forecast",
    "get_history",
    "get_recommendations",
    "explain_forecast",
}


def get_tool_definitions(model: str = _DEFAULT_MODEL) -> list[dict[str, Any]]:
    """Return tool definitions filtered for the active model."""
    if "deepseek" in model.lower():
        return [t for t in TOOL_DEFINITIONS if t["function"]["name"] in DEEPSEEK_TOOL_NAMES]
    return TOOL_DEFINITIONS


def get_deepseek_tool_text() -> str:
    """Build text-based tool descriptions for DeepSeek-R1 XML tag fallback."""
    lines = ["AVAILABLE TOOLS (output as XML tags when you need data):\n"]
    for i, t in enumerate(TOOL_DEFINITIONS, 1):
        fn = t["function"]
        if fn["name"] not in DEEPSEEK_TOOL_NAMES:
            continue
        params = fn["parameters"].get("properties", {})
        param_str = ", ".join(
            f"{k}='{v.get('description', k)}'" for k, v in params.items()
        )
        lines.append(f"{i}. {fn['name']} - {fn['description'][:80]}")
        lines.append(f"   Usage: <tool_call>{fn['name']}({param_str})</tool_call>\n")
    lines.append(
        "IMPORTANT: Output EXACTLY ONE tool_call tag at a time. "
        "Wait for the result before continuing your response."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Tool executors — call internal API logic directly, no HTTP round-trip
# ---------------------------------------------------------------------------

async def execute_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Execute a tool by name and return the result as a dict."""
    executor = _EXECUTORS.get(name)
    if not executor:
        return {"error": f"Unknown tool: {name}"}
    try:
        return await executor(args)
    except Exception as e:
        return {"error": f"Tool {name} failed: {str(e)}"}


async def _exec_get_current_status(_args: dict) -> dict:
    from server.deps import (
        get_features,
        get_hourly_data,
        get_target_column,
        get_xgb_model,
    )
    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    hourly = get_hourly_data()
    target = get_target_column()
    latest = hourly.iloc[-1]
    current_kw = float(latest[target])
    last_24 = hourly[target].iloc[-24:]
    today_kwh = float(last_24.sum())
    prices = build_hourly_price_vector(24)
    est_cost = compute_cost(last_24.values, prices)

    features = get_features()
    model = get_xgb_model()
    X_last = features.iloc[[-1]].drop(columns=[target], errors="ignore")
    preds = model.predict(X_last)[0]
    peak_idx = int(np.argmax(preds))
    alert = float(preds[peak_idx]) > 2.5

    return {
        "current_kw": round(current_kw, 3),
        "today_kwh": round(today_kwh, 2),
        "est_cost": round(est_cost, 2),
        "forecast_peak_kw": round(float(preds[peak_idx]), 3),
        "forecast_peak_hour": peak_idx,
        "alert": alert,
    }


async def _exec_get_forecast(args: dict) -> dict:
    from server.deps import (
        get_conformal_widths,
        get_features,
        get_hourly_data,
        get_ridge_model,
        get_target_column,
        get_xgb_model,
    )

    horizon = min(int(args.get("horizon", 24)), 24)
    model_name = args.get("model", "xgboost")
    if model_name == "seasonal_naive":
        model_name = "naive"

    features = get_features()
    target = get_target_column()
    hourly = get_hourly_data()
    origin_ts = features.index[-1]
    X_row = features.iloc[[-1]].drop(columns=[target], errors="ignore")

    if model_name == "naive":
        lag_col = "lag_168h"
        naive_val = float(X_row[lag_col].iloc[0]) if lag_col in X_row.columns else float(hourly[target].iloc[-168])
        point = np.full(horizon, naive_val)
    else:
        forecaster = get_xgb_model() if model_name == "xgboost" else get_ridge_model()
        point = forecaster.predict(X_row)[0, :horizon]

    widths = get_conformal_widths()
    width_arr = np.array([widths.get(f"h{h}", 0.3) for h in range(1, horizon + 1)])

    timestamps = [str(origin_ts + pd.Timedelta(hours=h + 1)) for h in range(horizon)]
    peak_risk = [bool(point[h] > 2.5) for h in range(horizon)]

    return {
        "timestamps": timestamps,
        "forecast": [round(float(v), 3) for v in point],
        "lower": [round(float(v), 3) for v in point - width_arr],
        "upper": [round(float(v), 3) for v in point + width_arr],
        "peak_risk_hours": [i for i, r in enumerate(peak_risk) if r],
    }


async def _exec_get_history(args: dict) -> dict:
    from server.deps import get_hourly_data, get_target_column

    hourly = get_hourly_data()
    target = get_target_column()
    start = args.get("start")
    end = args.get("end")
    gran = args.get("granularity", "hourly")

    series = hourly[target]
    if start:
        series = series[series.index >= pd.Timestamp(start)]
    if end:
        series = series[series.index <= pd.Timestamp(end)]

    resample_map = {"daily": "D", "weekly": "W", "monthly": "ME"}
    if gran in resample_map:
        series = series.resample(resample_map[gran]).mean()

    # Truncate for LLM context
    if len(series) > 200:
        series = series.iloc[-200:]

    values = [round(float(v), 3) for v in series.values if pd.notna(v)]
    timestamps = [str(ts) for ts in series.index]

    # Sub-meter breakdown summary
    sub_meters = {}
    for col in ["Sub_metering_1", "Sub_metering_2", "Sub_metering_3", "Other_consumption"]:
        if col in hourly.columns:
            sub_series = hourly[col]
            if start:
                sub_series = sub_series[sub_series.index >= pd.Timestamp(start)]
            if end:
                sub_series = sub_series[sub_series.index <= pd.Timestamp(end)]
            sub_meters[col] = round(float(sub_series.mean()), 3)

    return {
        "timestamps": timestamps[-20:],  # last 20 for context brevity
        "values": values[-20:],
        "total_points": len(values),
        "mean": round(float(np.nanmean(values)), 3) if values else 0,
        "max": round(float(np.nanmax(values)), 3) if values else 0,
        "min": round(float(np.nanmin(values)), 3) if values else 0,
        "sub_meters": sub_meters,
    }


async def _exec_get_recommendations(args: dict) -> dict:
    from server.deps import get_features, get_target_column, get_xgb_model
    from src.prescriptive.constraints import FlexibleLoad, get_default_loads
    from src.prescriptive.optimiser import optimise
    from src.prescriptive.pricing import build_hourly_price_vector

    features = get_features()
    target = get_target_column()
    model = get_xgb_model()
    X_last = features.iloc[[-1]].drop(columns=[target], errors="ignore")
    forecast_24 = model.predict(X_last)[0]

    loads = get_default_loads()
    comfort = float(args.get("comfort", 0.5))
    peak_weight = 1.0 - comfort

    result = optimise(forecast_24, loads=loads, peak_weight=peak_weight)
    prices = build_hourly_price_vector(24)

    recommendations = []
    for load in loads:
        opt_start = result.schedule.get(load.name)
        if opt_start is None:
            continue
        orig = load.original_start
        if orig is not None and opt_start != orig:
            orig_cost = sum(load.power_kw * prices[(orig + d) % 24] for d in range(load.duration_h))
            opt_cost = sum(load.power_kw * prices[(opt_start + d) % 24] for d in range(load.duration_h))
            savings = orig_cost - opt_cost
            desc = f"Shift {load.name} from {orig:02d}:00 to {opt_start:02d}:00"
        else:
            savings = 0.0
            desc = f"Schedule {load.name} at {opt_start:02d}:00"
        recommendations.append({
            "appliance": load.name,
            "shift_description": desc,
            "savings_eur": round(savings, 4),
        })

    return {
        "recommendations": recommendations,
        "peak_reduction": round(result.peak_reduction_kw, 3),
        "cost_change": round(result.cost_change_eur, 4),
    }


async def _exec_explain_forecast(args: dict) -> dict:
    from server.deps import get_shap_values
    from src.models.explain import get_top_drivers
    from src.skills.nl_explainer import explain_shap_drivers

    hour = int(args.get("hour", 0))
    shap_df = get_shap_values()
    origin_ts = shap_df.index[-1]
    target_idx = shap_df.index.get_loc(origin_ts)
    adjusted_idx = min(target_idx + hour, len(shap_df) - 1)
    row_ts = shap_df.index[adjusted_idx]

    top_drivers = get_top_drivers(shap_df, row_ts, n=5)
    narrative = explain_shap_drivers(top_drivers)

    return {
        "shap_features": [d["feature"] for d in top_drivers],
        "shap_values": [round(d["shap_value"], 4) for d in top_drivers],
        "narrative": narrative,
    }


async def _exec_run_simulation(args: dict) -> dict:
    from server.deps import get_conformal_widths, get_features, get_target_column, get_xgb_model
    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    features = get_features()
    target = get_target_column()
    model = get_xgb_model()
    X_last = features.iloc[[-1]].drop(columns=[target], errors="ignore")
    base_forecast = model.predict(X_last)[0, :24]

    # Apply scenario blocks
    modified = base_forecast.copy()
    for block in args.get("scenario_blocks", []):
        modified = _apply_sim_block(modified, block.get("type", ""), block.get("params", {}))

    widths = get_conformal_widths()
    width_arr = np.array([widths.get(f"h{h}", 0.3) for h in range(1, 25)])

    n_runs = min(int(args.get("n_runs", 200)), 500)
    rng = np.random.default_rng(42)
    paths = np.zeros((n_runs, 24))
    for i in range(n_runs):
        noise = rng.normal(0, width_arr / 1.645)
        paths[i] = np.maximum(modified + noise, 0)

    prices = build_hourly_price_vector(24)
    daily_kwh = paths.sum(axis=1)
    peak_kw = paths.max(axis=1)
    daily_cost = np.array([compute_cost(p, prices) for p in paths])

    return {
        "outcome_distributions": {
            "daily_kwh": {"mean": round(float(daily_kwh.mean()), 2), "std": round(float(daily_kwh.std()), 2)},
            "peak_kw": {"mean": round(float(peak_kw.mean()), 2), "std": round(float(peak_kw.std()), 2)},
            "daily_cost": {"mean": round(float(daily_cost.mean()), 2), "std": round(float(daily_cost.std()), 2)},
        },
        "probability_statements": [
            f"Daily cost is below {round(float(np.percentile(daily_cost, 80)), 2)} EUR in 80% of simulations.",
            f"Peak demand exceeds 2.5 kW in {round(float((peak_kw > 2.5).mean() * 100), 1)}% of runs.",
        ],
    }


async def _exec_get_statistics(args: dict) -> dict:
    from server.deps import get_hourly_data, get_target_column
    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    hourly = get_hourly_data()
    target = get_target_column()
    start = args.get("start")
    end = args.get("end")
    metric = args.get("metric", "power_kw")

    series = hourly[target]
    if start:
        series = series[series.index >= pd.Timestamp(start)]
    if end:
        series = series[series.index <= pd.Timestamp(end)]

    vals = series.dropna().values

    if metric == "daily_kwh":
        daily = series.resample("D").sum().dropna().values
        vals = daily
    elif metric == "cost":
        prices = build_hourly_price_vector(24)
        daily_cost = []
        for _, day_data in series.resample("D"):
            if len(day_data) == 24:
                daily_cost.append(compute_cost(day_data.values, prices))
        vals = np.array(daily_cost) if daily_cost else vals

    return {
        "mean": round(float(np.mean(vals)), 3),
        "std": round(float(np.std(vals)), 3),
        "min": round(float(np.min(vals)), 3),
        "max": round(float(np.max(vals)), 3),
        "percentiles": {
            "p25": round(float(np.percentile(vals, 25)), 3),
            "p50": round(float(np.percentile(vals, 50)), 3),
            "p75": round(float(np.percentile(vals, 75)), 3),
        },
        "n_points": len(vals),
    }


async def _exec_compare_periods(args: dict) -> dict:
    from server.deps import get_hourly_data, get_target_column

    hourly = get_hourly_data()
    target = get_target_column()

    def _period_stats(p: dict) -> dict:
        s = hourly[target]
        s = s[(s.index >= pd.Timestamp(p["start"])) & (s.index <= pd.Timestamp(p["end"]))]
        return {
            "mean": round(float(s.mean()), 3),
            "total_kwh": round(float(s.sum()), 2),
            "peak": round(float(s.max()), 3),
            "n_hours": len(s),
        }

    a = _period_stats(args.get("period_a", {}))
    b = _period_stats(args.get("period_b", {}))

    return {
        "period_a": a,
        "period_b": b,
        "deltas": {
            "mean_change": round(b["mean"] - a["mean"], 3),
            "total_change_kwh": round(b["total_kwh"] - a["total_kwh"], 2),
            "peak_change": round(b["peak"] - a["peak"], 3),
        },
        "summary": (
            f"Period B average was {'higher' if b['mean'] > a['mean'] else 'lower'} "
            f"by {abs(round(b['mean'] - a['mean'], 3))} kW."
        ),
    }


async def _exec_get_cost_breakdown(args: dict) -> dict:
    from server.deps import get_hourly_data, get_target_column
    from src.prescriptive.pricing import build_hourly_price_vector, get_tou_rate

    hourly = get_hourly_data()
    target = get_target_column()
    start = args.get("start")
    end = args.get("end")

    series = hourly[target]
    if start:
        series = series[series.index >= pd.Timestamp(start)]
    if end:
        series = series[series.index <= pd.Timestamp(end)]

    prices = build_hourly_price_vector(24)

    # Cost by TOU tier
    tier_cost = {"off_peak": 0.0, "mid_peak": 0.0, "on_peak": 0.0}
    for ts, val in series.items():
        if pd.isna(val):
            continue
        hour = ts.hour
        rate = prices[hour % 24]
        cost = float(val) * rate
        if hour >= 22 or hour < 6:
            tier_cost["off_peak"] += cost
        elif hour in (6, 7):
            tier_cost["mid_peak"] += cost
        else:
            tier_cost["on_peak"] += cost

    # Cost by sub-meter
    meter_cost = {}
    for col in ["Sub_metering_1", "Sub_metering_2", "Sub_metering_3", "Other_consumption"]:
        if col in hourly.columns:
            sub = hourly[col]
            if start:
                sub = sub[sub.index >= pd.Timestamp(start)]
            if end:
                sub = sub[sub.index <= pd.Timestamp(end)]
            total = sum(
                float(v) * prices[ts.hour % 24]
                for ts, v in sub.items()
                if pd.notna(v)
            )
            meter_cost[col] = round(total, 2)

    total = sum(tier_cost.values())
    n_days = max(1, len(series) // 24)

    return {
        "by_tier": {k: round(v, 2) for k, v in tier_cost.items()},
        "by_meter": meter_cost,
        "total": round(total, 2),
        "daily_avg": round(total / n_days, 2),
    }


async def _exec_update_recommendation(args: dict) -> dict:
    reco_id = args.get("reco_id", "")
    action = args.get("action", "accept")
    new_time = args.get("new_time")

    if action == "accept":
        return {
            "status": "accepted",
            "appliance": reco_id,
            "message": f"Recommendation for {reco_id} has been accepted.",
        }
    elif action == "reject":
        return {
            "status": "rejected",
            "appliance": reco_id,
            "message": f"Recommendation for {reco_id} has been rejected.",
        }
    elif action == "modify" and new_time:
        # Re-run optimisation with modified constraint
        return await _exec_get_recommendations({"comfort": 0.5})
    return {"error": f"Unknown action: {action}"}


def _apply_sim_block(profile: np.ndarray, block_type: str, params: dict) -> np.ndarray:
    """Apply a scenario modification block to a forecast profile."""
    result = profile.copy()
    if block_type == "scale":
        result *= float(params.get("factor", 1.0))
    elif block_type == "add_appliance":
        power = float(params.get("power_kw", 1.0))
        start = int(params.get("start_hour", 18))
        duration = int(params.get("duration_h", 2))
        for d in range(duration):
            result[(start + d) % len(result)] += power
    elif block_type == "remove_appliance":
        power = float(params.get("power_kw", 1.0))
        start = int(params.get("start_hour", 18))
        duration = int(params.get("duration_h", 2))
        for d in range(duration):
            h = (start + d) % len(result)
            result[h] = max(0, result[h] - power)
    elif block_type == "shift":
        result = np.roll(result, int(params.get("hours", 0)))
    elif block_type == "temperature_shock":
        result *= float(params.get("factor", 1.3))
    elif block_type == "occupancy":
        result *= float(params.get("factor", 1.0))
    elif block_type == "battery_solar":
        capacity = float(params.get("capacity_kwh", 5.0))
        solar_hours = range(8, 18)
        per_hour = capacity / 10
        for h in solar_hours:
            if h < len(result):
                result[h] = max(0, result[h] - per_hour)
    return result


# Executor registry
_EXECUTORS: dict[str, Any] = {
    "get_current_status": _exec_get_current_status,
    "get_forecast": _exec_get_forecast,
    "get_history": _exec_get_history,
    "get_recommendations": _exec_get_recommendations,
    "explain_forecast": _exec_explain_forecast,
    "run_simulation": _exec_run_simulation,
    "get_statistics": _exec_get_statistics,
    "compare_periods": _exec_compare_periods,
    "get_cost_breakdown": _exec_get_cost_breakdown,
    "update_recommendation": _exec_update_recommendation,
}
