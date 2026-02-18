"""
frontend.components.explainer
==============================
Section E – Insights & Explainer.

Displays:
    1. "Why is my forecast high?" panel – top-3 SHAP drivers as horizontal bar chart.
    2. Cost breakdown donut chart – share of daily cost by sub-meter
       (Kitchen / Laundry / Water Heater / Other).

SHAP values are loaded from ``results/shap_values.parquet`` (pre-computed by
``src.models.explain``).  Falls back to a live SHAP call if the file is absent.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.skills.config_loader import get_param, get_project_root
from src.skills.plotly_theme import COLOURS


def render_explainer(
    features_df: pd.DataFrame,
    model=None,
) -> None:
    """Render the insights and explainer section.

    Parameters
    ----------
    features_df : pd.DataFrame
        Feature matrix with DatetimeIndex.
    model : XGBForecaster | None
        Trained XGBoost model (used for live SHAP if saved values missing).
    """
    st.subheader("Insights & Explainer")

    col_shap, col_cost = st.columns(2)

    with col_shap:
        _render_shap_panel(features_df, model)

    with col_cost:
        _render_cost_donut(features_df)


def _render_shap_panel(
    features_df: pd.DataFrame,
    model,
) -> None:
    """Render the top-3 SHAP driver bar chart for the most recent forecast hour."""
    st.markdown("**Why is my forecast high?**")

    shap_df = _load_shap_values()

    if shap_df is None and model is not None:
        # Compute SHAP live for the last row only
        from src.models.explain import compute_shap_values
        target: str = get_param("data.target_column")
        feature_cols = [c for c in features_df.columns if c != target]
        last_row = features_df[feature_cols].iloc[[-1]]
        try:
            shap_df = compute_shap_values(model, last_row)
        except Exception:
            shap_df = None

    if shap_df is None:
        st.info("SHAP values not available. Run `make evaluate` to generate them.")
        return

    # Top 3 SHAP drivers for the last row
    last_shap = shap_df.iloc[-1]
    top3 = last_shap.abs().nlargest(3)
    driver_names = top3.index.tolist()
    driver_values = [float(last_shap[d]) for d in driver_names]
    colours = [COLOURS["accent"] if v >= 0 else COLOURS["alert"] for v in driver_values]

    fig = go.Figure(go.Bar(
        x=driver_values,
        y=driver_names,
        orientation="h",
        marker_color=colours,
    ))
    fig.update_layout(
        template="energy_dashboard",
        xaxis_title="SHAP value",
        height=250,
        margin={"l": 10, "r": 10, "t": 10, "b": 30},
    )
    st.plotly_chart(fig, use_container_width=True)


def _render_cost_donut(features_df: pd.DataFrame) -> None:
    """Render a cost-breakdown donut chart by sub-meter."""
    st.markdown("**Today's Cost Breakdown**")

    from src.prescriptive.pricing import build_hourly_price_vector, compute_cost

    today = features_df.last("1D")
    prices = build_hourly_price_vector(len(today))

    sub_cols = {
        "Kitchen (Sub_1)": "Sub_metering_1",
        "Laundry (Sub_2)": "Sub_metering_2",
        "Water Heater (Sub_3)": "Sub_metering_3",
    }

    costs: dict[str, float] = {}
    total_cost = 0.0
    for label, col in sub_cols.items():
        if col in today.columns:
            # Convert Wh sub-metering to kW (divide by 1000) then cost
            kw_profile = today[col].fillna(0).values / 1000.0
            c = compute_cost(kw_profile, prices)
            costs[label] = c
            total_cost += c

    # Other = remaining
    target: str = get_param("data.target_column")
    if target in today.columns:
        total_power_cost = compute_cost(today[target].fillna(0).values, prices)
        other_cost = max(0.0, total_power_cost - total_cost)
        costs["Other"] = other_cost

    if not costs:
        st.info("Sub-meter columns not found in data.")
        return

    fig = px.pie(
        names=list(costs.keys()),
        values=list(costs.values()),
        hole=0.5,
        color_discrete_sequence=[
            COLOURS["accent"],
            COLOURS["alert"],
            COLOURS["primary"],
            COLOURS["success"],
        ],
    )
    fig.update_layout(
        template="energy_dashboard",
        height=300,
        showlegend=True,
        margin={"l": 10, "r": 10, "t": 10, "b": 10},
    )
    st.plotly_chart(fig, use_container_width=True)


def _load_shap_values() -> Optional[pd.DataFrame]:
    """Load pre-computed SHAP values from Parquet, or return None if missing."""
    backend_root = get_project_root()
    path = backend_root / get_param("paths.shap_values_parquet")
    if not path.exists():
        return None
    return pd.read_parquet(path, engine="pyarrow")
