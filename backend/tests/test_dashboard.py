"""
tests.test_dashboard
=====================
Pricing utility tests used by dashboard components.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


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
