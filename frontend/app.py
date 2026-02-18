"""
frontend.app
=============
Streamlit application entry-point for the Household Energy Dashboard.

Sections:
    A - Status Bar       : Current draw KPI cards and peak alert.
    B - Forecast Panel   : 24h / 7d forecast with confidence band.
    C - Historical       : Week-over-week, monthly trend, heatmap.
    D - Recommendations  : Load-shift cards with accept/dismiss.
    E - Insights         : SHAP drivers and cost breakdown.

All configuration (port, title, thresholds) is read from
``configs/params.yaml`` via ``src.skills.config_loader``.

Run with::

    cd frontend && PYTHONPATH=../backend streamlit run app.py
    # or from backend/:
    make dashboard
"""

from __future__ import annotations

from typing import Optional

import pandas as pd
import streamlit as st

from src.skills.config_loader import get_param, get_project_root, load_config
from src.skills.plotly_theme import register_theme
from src.skills.logger import get_logger

logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# App configuration (must be the first Streamlit call)
# ---------------------------------------------------------------------------

def _configure_page() -> None:
    """Set Streamlit page metadata from params.yaml."""
    cfg = load_config()
    st.set_page_config(
        page_title=get_param("dashboard.title"),
        page_icon=f":{get_param('dashboard.page_icon')}:",
        layout=get_param("dashboard.layout"),
        initial_sidebar_state="expanded",
    )
    register_theme()


# ---------------------------------------------------------------------------
# Data loading (cached for performance)
# ---------------------------------------------------------------------------

@st.cache_data(show_spinner="Loading pipeline artefacts …")
def _load_features() -> Optional[pd.DataFrame]:
    """Load the feature matrix Parquet, returning None if not yet generated."""
    backend_root = get_project_root()
    path = backend_root / get_param("paths.features_parquet")
    if not path.exists():
        return None
    return pd.read_parquet(path, engine="pyarrow")


@st.cache_data(show_spinner="Loading forecasts …")
def _load_conformal_widths() -> Optional[dict[str, float]]:
    """Load conformal prediction widths, returning None if not yet generated."""
    backend_root = get_project_root()
    path = backend_root / get_param("paths.conformal_widths")
    if not path.exists():
        return None
    import json
    with open(path) as fh:
        return json.load(fh)


@st.cache_resource(show_spinner="Loading XGBoost models …")
def _load_xgb_model():
    """Load the trained XGBoost forecaster (cached as a resource)."""
    backend_root = get_project_root()
    models_dir = backend_root / get_param("paths.models")
    h1_path = models_dir / "xgb_h1.joblib"
    if not h1_path.exists():
        return None
    try:
        from src.models.xgb import XGBForecaster
        return XGBForecaster.load(models_dir)
    except Exception as exc:
        logger.warning("Could not load XGBoost models: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Main app
# ---------------------------------------------------------------------------

def main() -> None:
    """Render the complete dashboard."""
    _configure_page()

    st.title(get_param("dashboard.title"))

    # Load artefacts
    features_df = _load_features()
    conformal_widths = _load_conformal_widths()
    xgb_model = _load_xgb_model()

    if features_df is None:
        st.warning(
            "Pipeline artefacts not found. "
            "Run `make all` in backend/ to generate them before launching the dashboard."
        )
        st.stop()

    # --- Section A: Status Bar ---
    from components.status_bar import render_status_bar
    render_status_bar(features_df)

    st.divider()

    # --- Section B: Forecast Panel ---
    from components.forecast_panel import render_forecast_panel
    render_forecast_panel(features_df, xgb_model, conformal_widths)

    st.divider()

    # --- Section C: Historical Comparison ---
    from components.history import render_history
    render_history(features_df)

    st.divider()

    # --- Section D: Recommendations ---
    from components.recommendations import render_recommendations
    render_recommendations(features_df, xgb_model)

    st.divider()

    # --- Section E: Insights & Explainer ---
    from components.explainer import render_explainer
    render_explainer(features_df, xgb_model)


if __name__ == "__main__":
    main()
