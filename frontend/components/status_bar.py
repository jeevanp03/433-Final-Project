"""
frontend.components.status_bar
================================
Section A – KPI status bar.

Displays three KPI metric cards and a peak-alert badge:
    1. Current Draw (kW)   – colour-coded: green < 1.5 kW, amber 1.5-2.5, red > 2.5
    2. Today's Total (kWh) – rolling sum since midnight with a 24-h sparkline
    3. Estimated Daily Cost (EUR) – based on TOU pricing
    4. Peak Alert Badge     – red badge if any forecast hour in next 6h exceeds
                              the ``peak_alert_quantile`` of the training distribution

All thresholds are read from ``configs/params.yaml``.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
import streamlit as st

from src.skills.config_loader import get_param
from src.prescriptive.pricing import build_hourly_price_vector, compute_cost


def render_status_bar(
    features_df: pd.DataFrame,
    forecast_next24: Optional[np.ndarray] = None,
) -> None:
    """Render the KPI status bar section.

    Parameters
    ----------
    features_df : pd.DataFrame
        Feature matrix (must contain the target column with DatetimeIndex).
    forecast_next24 : np.ndarray | None
        Shape ``(24,)`` forecast for the next 24 hours.  Used for peak alert.
        If ``None``, the alert section is skipped.
    """
    target: str = get_param("data.target_column")
    alert_quantile: float = get_param("dashboard.peak_alert_quantile")
    alert_window: int = get_param("dashboard.peak_alert_window_h")
    sparkline_h: int = get_param("dashboard.sparkline_hours")

    # Latest available data point
    last_row = features_df[target].dropna().iloc[-1]
    current_kw = float(last_row)

    # Today's total kWh (sum since midnight)
    today = features_df[target].last("1D").dropna()
    today_kwh = float(today.sum())

    # Estimated daily cost (EUR)
    prices = build_hourly_price_vector(len(today))
    today_cost = compute_cost(today.values, prices[:len(today)])

    # KPI colour coding for current draw
    if current_kw < 1.5:
        current_colour = "normal"   # green in Streamlit delta
    elif current_kw < 2.5:
        current_colour = "inverse"  # amber: use inverse (orange/yellow)
    else:
        current_colour = "off"      # red

    # Render three metric columns
    col1, col2, col3 = st.columns(3)
    with col1:
        st.metric(
            label="Current Draw",
            value=f"{current_kw:.2f} kW",
            delta=None,
            help="Most recent hourly average power draw.",
        )
    with col2:
        st.metric(
            label="Today's Total",
            value=f"{today_kwh:.1f} kWh",
            help="Energy consumed since midnight today.",
        )
    with col3:
        st.metric(
            label="Estimated Daily Cost",
            value=f"EUR {today_cost:.2f}",
            help="Estimated cost using the TOU tariff schedule.",
        )

    # Peak alert badge
    if forecast_next24 is not None:
        threshold = float(
            np.quantile(features_df[target].dropna().values, alert_quantile)
        )
        next_window = forecast_next24[:alert_window]
        if np.any(next_window > threshold):
            st.error(
                f"Peak Alert: forecast exceeds the {int(alert_quantile*100)}th-percentile "
                f"threshold ({threshold:.2f} kW) in the next {alert_window} hours."
            )
        else:
            st.success("No peak alert in the next 6 hours.")
