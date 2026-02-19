"""
Context builder — assembles a snapshot of current dashboard state.

Injected into every LLM message so the assistant knows what the user is
looking at. Respects token budget (~200 tokens).
"""

from __future__ import annotations

from typing import Any


def build_context_block(context: dict[str, Any], compact: bool = False) -> str:
    """Build a context string from the frontend's context payload.

    Parameters
    ----------
    context : dict
        Keys sent by the frontend: page, filters, kpis, pending_recos,
        active_simulation, user_preferences.
    compact : bool
        If True, emit a shorter version for DeepSeek-R1 (~100 tokens).
    """
    if not context:
        return ""

    lines = ["CURRENT CONTEXT:"]

    # Page
    page = context.get("page", "Dashboard")
    lines.append(f"- Page: {page}")

    # Filters (horizon, model, date range, etc.)
    filters = context.get("filters", {})
    if filters:
        if "horizon" in filters:
            lines.append(f"- Forecast horizon: {filters['horizon']}")
        if "model" in filters:
            lines.append(f"- Model: {filters['model']}")
        if "origin" in filters:
            lines.append(f"- Forecast origin: {filters['origin']}")
        if not compact:
            if "date_range" in filters:
                dr = filters["date_range"]
                lines.append(f"- Date range: {dr.get('start', '?')} to {dr.get('end', '?')}")
            if "granularity" in filters:
                lines.append(f"- Granularity: {filters['granularity']}")
            if "meters" in filters:
                lines.append(f"- Sub-meters: {', '.join(filters['meters'])}")

    # KPIs
    kpis = context.get("kpis", {})
    if kpis:
        parts = []
        if "current_kw" in kpis:
            parts.append(f"{kpis['current_kw']} kW draw")
        if "today_kwh" in kpis:
            parts.append(f"{kpis['today_kwh']} kWh today")
        if "est_cost" in kpis:
            parts.append(f"EUR {kpis['est_cost']} est. cost")
        if parts:
            lines.append(f"- Current KPI: {', '.join(parts)}")

    # Pending recommendations
    recos = context.get("pending_recos", [])
    if recos and not compact:
        reco_names = [r.get("appliance", r) if isinstance(r, dict) else str(r) for r in recos[:5]]
        lines.append(f"- Pending recommendations: {len(recos)} ({', '.join(reco_names)})")

    # Active simulation
    sim = context.get("active_simulation")
    if sim and not compact:
        lines.append(f"- Active simulation: {sim}")

    # User preferences
    prefs = context.get("user_preferences", {})
    if prefs and not compact:
        pref_parts = []
        if "comfort_priority" in prefs:
            pref_parts.append(f"comfort_priority={prefs['comfort_priority']}")
        if "max_deferral" in prefs:
            pref_parts.append(f"max_deferral={prefs['max_deferral']}h")
        if pref_parts:
            lines.append(f"- User preferences: {', '.join(pref_parts)}")

    return "\n".join(lines)
