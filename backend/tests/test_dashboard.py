"""
tests.test_dashboard
=====================
Smoke tests for dashboard components and pricing utilities.

Dashboard components now live in ``frontend/components/``. Import tests add the
frontend directory to sys.path so they can verify importability.  Pricing utility
tests import from ``src.prescriptive.pricing`` which stays in the backend.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Add frontend/ to sys.path so component imports resolve
_FRONTEND_DIR = str(Path(__file__).resolve().parents[2] / "frontend")
if _FRONTEND_DIR not in sys.path:
    sys.path.insert(0, _FRONTEND_DIR)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def minimal_features_df():
    """Minimal feature DataFrame with sub-metering columns for dashboard tests."""
    n = 100
    idx = pd.date_range("2010-01-01", periods=n, freq="1h")
    rng = np.random.default_rng(7)
    df = pd.DataFrame(
        {
            "Global_active_power": rng.uniform(0.3, 3.0, n),
            "Sub_metering_1": rng.uniform(0, 30, n),
            "Sub_metering_2": rng.uniform(0, 30, n),
            "Sub_metering_3": rng.uniform(0, 30, n),
            "gap_flag": False,
            "lag_1h": rng.uniform(0.3, 3.0, n),
            "lag_24h": rng.uniform(0.3, 3.0, n),
            "lag_168h": rng.uniform(0.3, 3.0, n),
            "hour_of_day": idx.hour,
            "day_of_week": idx.dayofweek,
            "is_weekend": (idx.dayofweek >= 5).astype(int),
            "month": idx.month,
            "hour_sin": np.sin(2 * np.pi * idx.hour / 24),
            "hour_cos": np.cos(2 * np.pi * idx.hour / 24),
            "month_sin": np.sin(2 * np.pi * (idx.month - 1) / 12),
            "month_cos": np.cos(2 * np.pi * (idx.month - 1) / 12),
            "roll_mean_24h": rng.uniform(0.5, 2.5, n),
            "roll_std_24h": rng.uniform(0.0, 0.5, n),
            "is_holiday": 0,
        },
        index=idx,
    )
    return df


# ---------------------------------------------------------------------------
# Import smoke tests
# ---------------------------------------------------------------------------

class TestComponentImports:
    """Verify all dashboard components are importable without side effects."""

    def test_import_status_bar(self) -> None:
        from components import status_bar  # noqa: F401

    def test_import_forecast_panel(self) -> None:
        from components import forecast_panel  # noqa: F401

    def test_import_history(self) -> None:
        from components import history  # noqa: F401

    def test_import_recommendations(self) -> None:
        from components import recommendations  # noqa: F401

    def test_import_explainer(self) -> None:
        from components import explainer  # noqa: F401

    def test_import_app(self) -> None:
        pytest.importorskip("streamlit")
        import importlib
        # app.py is in frontend/ — check it's importable
        spec = importlib.util.find_spec("app")
        assert spec is not None, "frontend/app.py module not found on sys.path."


# ---------------------------------------------------------------------------
# Pricing utility tests (used by dashboard)
# ---------------------------------------------------------------------------

class TestPricingUtils:
    def test_build_hourly_price_vector_24(self) -> None:
        from src.prescriptive.pricing import build_hourly_price_vector
        prices = build_hourly_price_vector(24)
        assert len(prices) == 24
        assert all(p > 0 for p in prices)

    def test_compute_cost_positive(self, minimal_features_df) -> None:
        from src.prescriptive.pricing import build_hourly_price_vector, compute_cost
        power = minimal_features_df["Global_active_power"].values[:24]
        prices = build_hourly_price_vector(24)
        cost = compute_cost(power, prices)
        assert cost >= 0, "Cost must be non-negative."
