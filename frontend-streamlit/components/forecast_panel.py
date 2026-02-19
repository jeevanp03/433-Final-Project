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
from plotly.subplots import make_subplots
import streamlit as st

from src.skills.config_loader import get_param
from src.skills.plotly_theme import COLOURS
from src.models.conformal import apply_intervals
from src.prescriptive.pricing import get_tou_rate, get_tier_label


# TOU tier colours
_TOU_COLOURS = {
    "off_peak": "rgba(56,142,60,0.18)",   # green
    "mid_peak": "rgba(232,121,47,0.18)",   # orange
    "on_peak": "rgba(211,47,47,0.18)",     # red
}
_TOU_LINE_COLOURS = {
    "off_peak": COLOURS["success"],
    "mid_peak": COLOURS["alert"],
    "on_peak": COLOURS["danger"],
}


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

    if horizon <= 24:
        forecast_values = preds_24[:horizon]
    else:
        # 168h (7-day): tile the 24h pattern to cover the full horizon
        n_tiles = int(np.ceil(horizon / 24))
        forecast_values = np.tile(preds_24, n_tiles)[:horizon]

    forecast_index = pd.date_range(
        last_ts + pd.Timedelta(hours=1), periods=len(forecast_values), freq="1h"
    )
    forecast_series = pd.Series(forecast_values, index=forecast_index)

    # Build chart — use subplots if TOU overlay is requested
    if show_tou:
        fig = make_subplots(specs=[[{"secondary_y": True}]])
    else:
        fig = go.Figure()

    # Helper: add_trace with optional secondary_y
    def _add(trace, secondary_y=False):
        if show_tou:
            fig.add_trace(trace, secondary_y=secondary_y)
        else:
            fig.add_trace(trace)

    # Actuals trace
    _add(go.Scatter(
        x=actuals.index,
        y=actuals.values,
        name="Actual",
        line={"color": COLOURS["primary"], "width": 2},
        mode="lines",
    ))

    # Confidence band
    if conformal_widths is not None:
        # For horizons > 24, reuse widths cyclically (h mod 24)
        n_fc = len(forecast_index)
        cyclic_widths = {
            f"h{i+1}": conformal_widths[f"h{(i % 24) + 1}"]
            for i in range(n_fc)
        }
        fc_preds = forecast_values.reshape(1, -1)
        lower, upper = apply_intervals(fc_preds, cyclic_widths)
        _add(go.Scatter(
            x=list(forecast_index) + list(forecast_index[::-1]),
            y=list(upper[0]) + list(lower[0][::-1]),
            fill="toself",
            fillcolor="rgba(46,117,182,0.15)",
            line={"color": "rgba(0,0,0,0)"},
            name="90% CI",
            showlegend=True,
        ))

    # Forecast trace
    _add(go.Scatter(
        x=forecast_index,
        y=forecast_series.values,
        name="Forecast",
        line={"color": COLOURS["accent"], "width": 2, "dash": "dash"},
        mode="lines",
    ))

    # TOU price overlay on secondary y-axis
    if show_tou:
        # Build TOU price step for forecast hours
        tou_rates = np.array([get_tou_rate(ts.hour) for ts in forecast_index])
        tier_labels = [get_tier_label(ts.hour) for ts in forecast_index]

        # Coloured step chart for TOU rate
        _add(go.Scatter(
            x=forecast_index,
            y=tou_rates,
            name="TOU Rate (EUR/kWh)",
            line={"color": COLOURS["alert"], "width": 1.5, "shape": "hv"},
            mode="lines",
            opacity=0.7,
        ), secondary_y=True)

        # Add shaded regions per tier
        for i, ts in enumerate(forecast_index):
            tier = tier_labels[i]
            fig.add_vrect(
                x0=ts - pd.Timedelta(minutes=30),
                x1=ts + pd.Timedelta(minutes=30),
                fillcolor=_TOU_COLOURS.get(tier, "rgba(0,0,0,0.05)"),
                line_width=0,
                layer="below",
            )

        fig.update_yaxes(
            title_text="TOU Rate (EUR/kWh)",
            secondary_y=True,
            showgrid=False,
        )

    layout_kwargs = dict(
        template="energy_dashboard",
        xaxis_title="Time",
        legend={"orientation": "h"},
        height=450 if show_tou else 400,
    )
    if show_tou:
        fig.update_yaxes(title_text="Power (kW)", secondary_y=False)
    else:
        layout_kwargs["yaxis_title"] = "Power (kW)"

    fig.update_layout(**layout_kwargs)

    if horizon > 24:
        st.caption("7-day forecast repeats the 24h daily pattern.")

    st.plotly_chart(fig, width="stretch")
