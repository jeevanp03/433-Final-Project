"""
frontend.components.history
=============================
Section C – Historical comparison.

Displays:
    1. Week-over-week overlay: this week (solid) vs last week (dashed).
    2. Monthly trend bar chart: past 12 months, bars coloured by season.
    3. Demand heatmap: 24 hours x 12 months (average kW per cell).

All visualisations use the project colour palette from
``src.skills.plotly_theme``.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from src.skills.config_loader import get_param
from src.skills.plotly_theme import COLOURS


_SEASON_COLOURS = {
    "Winter": COLOURS["blue"],
    "Spring": COLOURS["green"],
    "Summer": COLOURS["orange"],
    "Autumn": COLOURS["navy"],
}


def render_history(features_df: pd.DataFrame) -> None:
    """Render the historical comparison section.

    Parameters
    ----------
    features_df : pd.DataFrame
        Feature matrix with DatetimeIndex and target column.
    """
    st.subheader("Historical Comparison")

    target: str = get_param("data.target_column")
    series = features_df[target].dropna()

    tab1, tab2, tab3 = st.tabs(["Week-over-Week", "Monthly Trend", "Demand Heatmap"])

    with tab1:
        _render_week_overlay(series)

    with tab2:
        _render_monthly_trend(series)

    with tab3:
        _render_demand_heatmap(series)


def _render_week_overlay(series: pd.Series) -> None:
    """Week-over-week overlay: this week solid, last week dashed."""
    now = series.index[-1]
    this_week = series.last("7D")
    last_week_end = now - pd.Timedelta(weeks=1)
    last_week = series.loc[
        last_week_end - pd.Timedelta(days=7): last_week_end
    ]

    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=this_week.index,
        y=this_week.values,
        name="This Week",
        line={"color": COLOURS["blue"], "width": 2},
    ))
    # Align last week's timestamps to this week for overlay
    if len(last_week) > 0:
        aligned_idx = last_week.index + pd.Timedelta(weeks=1)
        fig.add_trace(go.Scatter(
            x=aligned_idx,
            y=last_week.values,
            name="Last Week",
            line={"color": COLOURS["navy"], "width": 2, "dash": "dash"},
        ))

    fig.update_layout(
        template="energy_dashboard",
        xaxis_title="Time",
        yaxis_title="Power (kW)",
        height=350,
    )
    st.plotly_chart(fig, use_container_width=True)


def _render_monthly_trend(series: pd.Series) -> None:
    """Monthly average kW bar chart, coloured by season."""
    monthly = series.resample("ME").mean().last("12ME")
    months = monthly.index.to_period("M").astype(str)
    seasons = monthly.index.month.map(_month_to_season)

    fig = go.Figure()
    for season in ["Winter", "Spring", "Summer", "Autumn"]:
        mask = seasons == season
        fig.add_trace(go.Bar(
            x=months[mask],
            y=monthly.values[mask],
            name=season,
            marker_color=_SEASON_COLOURS[season],
        ))

    fig.update_layout(
        template="energy_dashboard",
        barmode="stack",
        xaxis_title="Month",
        yaxis_title="Avg Power (kW)",
        height=350,
    )
    st.plotly_chart(fig, use_container_width=True)


def _render_demand_heatmap(series: pd.Series) -> None:
    """24 h x 12 months average demand heatmap."""
    df = series.to_frame("power")
    df["hour"] = df.index.hour
    df["month"] = df.index.month

    pivot = df.pivot_table(values="power", index="hour", columns="month", aggfunc="mean")
    pivot.columns = [
        "Jan","Feb","Mar","Apr","May","Jun",
        "Jul","Aug","Sep","Oct","Nov","Dec",
    ][: len(pivot.columns)]

    fig = px.imshow(
        pivot,
        labels={"x": "Month", "y": "Hour of Day", "color": "Avg kW"},
        color_continuous_scale="Blues",
        aspect="auto",
    )
    fig.update_layout(template="energy_dashboard", height=400)
    st.plotly_chart(fig, use_container_width=True)


def _month_to_season(month: int) -> str:
    if month in (12, 1, 2):
        return "Winter"
    elif month in (3, 4, 5):
        return "Spring"
    elif month in (6, 7, 8):
        return "Summer"
    else:
        return "Autumn"
