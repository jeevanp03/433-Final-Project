"""
frontend.components.recommendations
======================================
Section D – Load-shift recommendations panel.

Displays:
    - Recommendation cards (appliance name, current time -> recommended time,
      estimated cost saving).
    - Accept / Dismiss buttons per card (state stored in st.session_state).
    - Constraint sliders: max deferral, max shifts per day,
      comfort vs savings trade-off (alpha).
    - What-if toggle: overlay the optimised profile on the forecast chart.

The optimiser is called on demand from ``src.prescriptive.optimiser``.
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd
import streamlit as st

from src.prescriptive.constraints import FlexibleLoad, get_default_loads
from src.prescriptive.optimiser import OptimisedSchedule, optimise
from src.skills.config_loader import get_param


def render_recommendations(
    features_df: pd.DataFrame,
    model=None,
) -> None:
    """Render the recommendations section.

    Parameters
    ----------
    features_df : pd.DataFrame
        Feature matrix with DatetimeIndex and target column.
    model : XGBForecaster | None
        Trained XGBoost model used to generate the 24-h forecast profile.
    """
    st.subheader("Load-Shift Recommendations")

    # --- Sidebar controls ---
    with st.expander("Optimisation settings", expanded=False):
        peak_weight = st.slider(
            "Peak vs cost weight (alpha)",
            min_value=0.0,
            max_value=1.0,
            value=float(get_param("prescriptive.peak_weight")),
            step=0.05,
            help="0 = minimise cost only. 1 = minimise peak only.",
        )

    # Build forecast profile
    target: str = get_param("data.target_column")
    if model is not None:
        feature_cols = [c for c in features_df.columns if c != target]
        preds = model.predict(features_df[feature_cols].iloc[[-1]])
        forecast_24h = preds[0, :24].astype(float)
    else:
        # Fall back to last 24 actuals as the "forecast"
        forecast_24h = features_df[target].dropna().values[-24:].astype(float)

    # Run optimiser
    loads = get_default_loads()
    schedule: OptimisedSchedule = optimise(forecast_24h, loads=loads, peak_weight=peak_weight)

    if not schedule.feasible:
        st.warning("Optimiser could not find a feasible schedule. Try relaxing constraints.")
        return

    st.success(
        f"Peak reduced by **{schedule.peak_reduction_kw:.2f} kW** "
        f"({schedule.peak_reduction_pct:.1f}%).  "
        f"Cost change: **EUR {schedule.cost_change_eur:+.2f}** "
        f"({schedule.cost_change_pct:+.1f}%)."
    )

    # Initialise session state for accept/dismiss
    if "accepted" not in st.session_state:
        st.session_state["accepted"] = set()
    if "dismissed" not in st.session_state:
        st.session_state["dismissed"] = set()

    # Render one card per load
    for load in loads:
        if load.name in st.session_state["dismissed"]:
            continue

        optimised_start = schedule.schedule.get(load.name)
        if optimised_start is None:
            continue

        original_start = load.original_start
        card_key = f"card_{load.name}"

        with st.container(border=True):
            cols = st.columns([3, 1, 1])
            with cols[0]:
                if original_start is not None:
                    st.write(
                        f"**{load.name.replace('_', ' ').title()}** — "
                        f"Move from {original_start:02d}:00 → {optimised_start:02d}:00"
                    )
                else:
                    st.write(
                        f"**{load.name.replace('_', ' ').title()}** — "
                        f"Recommend start at {optimised_start:02d}:00"
                    )
                st.caption(
                    f"{load.duration_h}h @ {load.power_kw} kW | "
                    f"{load.energy_kwh():.2f} kWh per cycle"
                )
            with cols[1]:
                if st.button("Accept", key=f"accept_{card_key}"):
                    st.session_state["accepted"].add(load.name)
            with cols[2]:
                if st.button("Dismiss", key=f"dismiss_{card_key}"):
                    st.session_state["dismissed"].add(load.name)

    # What-if profile overlay
    if st.checkbox("Show what-if optimised profile", value=False):
        import plotly.graph_objects as go
        from src.skills.plotly_theme import COLOURS

        fig = go.Figure()
        hours = list(range(24))
        fig.add_trace(go.Scatter(
            x=hours,
            y=schedule.baseline_profile,
            name="Baseline",
            line={"color": COLOURS["navy"], "width": 2},
        ))
        fig.add_trace(go.Scatter(
            x=hours,
            y=schedule.optimised_profile,
            name="Optimised",
            line={"color": COLOURS["green"], "width": 2, "dash": "dash"},
        ))
        fig.update_layout(
            template="energy_dashboard",
            xaxis_title="Hour of Day",
            yaxis_title="Load (kW)",
            height=300,
        )
        st.plotly_chart(fig, use_container_width=True)
