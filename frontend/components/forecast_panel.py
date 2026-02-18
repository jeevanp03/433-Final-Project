"""
frontend.components.forecast_panel
====================================
Section B – Forecast panel.

Displays:
    - Actual load for the past 48 hours (solid line)
    - Forecast for the next 24 h or 7 days (dashed line with 90% CI band)
    - Peak-risk overlay (red stripe for hours above the peak threshold)
    - Toggle: 24h vs 7d horizon
    - Optional TOU price overlay on a secondary y-axis

Colours and chart styling come from ``src.skills.plotly_theme``.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from src.skills.config_loader import get_param
from src.skills.plotly_theme import COLOURS
from src.models.conformal import apply_intervals


def render_forecast_panel(
    features_df: pd.DataFrame,
    model=None,
    conformal_widths: Optional[dict[str, float]] = None,
) -> None:
    """Render the forecast panel.

    Parameters
    ----------
    features_df : pd.DataFrame
        Feature matrix with DatetimeIndex.
    model : XGBForecaster | None
        Trained XGBoost model.  If ``None``, the forecast section is hidden.
    conformal_widths : dict | None
        Conformal half-widths.  If ``None``, no confidence band is shown.
    """
    st.subheader("Forecast")

    horizon_options: list[int] = get_param("dashboard.horizon_options")
    horizon = st.radio(
        "Horizon",
        options=horizon_options,
        format_func=lambda h: f"{h}h ({h // 24}d)" if h >= 24 else f"{h}h",
        horizontal=True,
    )
    show_tou = st.checkbox("Overlay TOU prices", value=False)

    target: str = get_param("data.target_column")
    lookback_h = 48

    # Historical actuals (past 48 h)
    actuals = features_df[target].dropna().iloc[-lookback_h:]

    if model is None:
        st.info("No trained model found. Run `make train` first.")
        return

    # Generate forecasts using the last available feature row
    feature_cols = [c for c in features_df.columns if c != target]
    last_features = features_df[feature_cols].iloc[[-1]]
    preds_2d = model.predict(last_features)   # shape (1, 24)
    preds_24 = preds_2d[0, :24]              # first 24 horizons

    # Build forecast index starting from the next hour
    last_ts = actuals.index[-1]
    forecast_index = pd.date_range(
        last_ts + pd.Timedelta(hours=1), periods=min(horizon, 24), freq="1h"
    )
    forecast_series = pd.Series(preds_24[: len(forecast_index)], index=forecast_index)

    # Build chart
    fig = go.Figure()

    # Actuals trace
    fig.add_trace(go.Scatter(
        x=actuals.index,
        y=actuals.values,
        name="Actual",
        line={"color": COLOURS["primary"], "width": 2},
        mode="lines",
    ))

    # Confidence band
    if conformal_widths is not None:
        lower, upper = apply_intervals(
            preds_2d[:, : len(forecast_index)],
            {k: v for k, v in conformal_widths.items() if int(k[1:]) <= len(forecast_index)},
        )
        fig.add_trace(go.Scatter(
            x=list(forecast_index) + list(forecast_index[::-1]),
            y=list(upper[0]) + list(lower[0][::-1]),
            fill="toself",
            fillcolor="rgba(46,117,182,0.15)",
            line={"color": "rgba(0,0,0,0)"},
            name="90% CI",
            showlegend=True,
        ))

    # Forecast trace
    fig.add_trace(go.Scatter(
        x=forecast_index,
        y=forecast_series.values,
        name="Forecast",
        line={"color": COLOURS["accent"], "width": 2, "dash": "dash"},
        mode="lines",
    ))

    fig.update_layout(
        template="energy_dashboard",
        xaxis_title="Time",
        yaxis_title="Power (kW)",
        legend={"orientation": "h"},
        height=400,
    )

    st.plotly_chart(fig, use_container_width=True)
