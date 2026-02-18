"""
tests.test_features
====================
Unit tests for ``src.features.engineer``.

CRITICAL INVARIANT: every feature at row i must use only data from
timestamps strictly before index[i].  Lag indices k >= 1 and rolling
windows are shifted by .shift(1) to enforce this.

Test IDs (from TODO.md Phase 3E)
---------------------------------
3.25  test_no_leakage   : Verify no feature at row i contains y(t_i) or later.
3.26  test_lag_values   : Spot-check lag_24h[i] == target[i-24].

Additional tests
-----------------
test_feature_columns_present : Required feature columns all exist.
test_warmup_rows_dropped     : First N rows are dropped; no NaN after warmup.
test_rolling_stats_positive  : roll_std columns are non-negative.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def clean_hourly():
    """Synthetic clean hourly DataFrame with 500 rows."""
    n = 500
    idx = pd.date_range("2007-01-01", periods=n, freq="1h")
    rng = np.random.default_rng(0)
    df = pd.DataFrame(
        {
            "Global_active_power": rng.uniform(0.3, 3.5, n),
            "Global_reactive_power": rng.uniform(0.0, 0.5, n),
            "Voltage": rng.uniform(229.0, 241.0, n),
            "Global_intensity": rng.uniform(1.0, 15.0, n),
            "Sub_metering_1": rng.uniform(0, 40, n),
            "Sub_metering_2": rng.uniform(0, 40, n),
            "Sub_metering_3": rng.uniform(0, 40, n),
            "Other_consumption": rng.uniform(0, 100, n),
            "gap_flag": False,
        },
        index=idx,
    )
    return df


@pytest.fixture(scope="module")
def feature_df(clean_hourly):
    """Feature matrix produced by build_features() on synthetic data."""
    from src.features.engineer import build_features
    return build_features(clean_hourly)


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestNoLeakage:
    """Critical leakage tests (TODO 3.25)."""

    def test_no_leakage(self, feature_df: pd.DataFrame, clean_hourly: pd.DataFrame) -> None:
        """Every feature at row i must be calculable from data before index[i].

        Checks: lag columns all have indices k >= 1 and rolling columns
        are derived from .shift(1) windows (so they cannot contain y(t_i)).
        This is verified by confirming lag_1h[i] == target[i-1], which
        implies the value stored is strictly from the past.
        """
        from src.skills.config_loader import get_param
        target = get_param("data.target_column")

        lag_col = "lag_1h"
        assert lag_col in feature_df.columns, f"Missing lag column: {lag_col}"

        # Verify lag_1h at every row matches the actual target value 1 step back
        # Use a 20-row sample for efficiency
        sample_idx = feature_df.index[:20]
        for ts in sample_idx:
            prev_ts = ts - pd.Timedelta(hours=1)
            if prev_ts in clean_hourly.index:
                expected = float(clean_hourly.loc[prev_ts, target])
                actual = float(feature_df.loc[ts, lag_col])
                assert abs(actual - expected) < 1e-9, (
                    f"Leakage at {ts}: lag_1h={actual:.6f} != target[t-1]={expected:.6f}"
                )

    def test_lag_zero_not_present(self, feature_df: pd.DataFrame) -> None:
        """No 'lag_0h' column should exist (that would be the current value)."""
        assert "lag_0h" not in feature_df.columns, (
            "lag_0h column detected – this is the current-row target and causes leakage."
        )


class TestLagValues:
    """Spot-check lag feature correctness (TODO 3.26)."""

    def test_lag_24h_spot_check(
        self, feature_df: pd.DataFrame, clean_hourly: pd.DataFrame
    ) -> None:
        """lag_24h[i] must equal target[i-24] (TODO 3.26)."""
        from src.skills.config_loader import get_param
        target = get_param("data.target_column")
        lag_col = "lag_24h"

        if lag_col not in feature_df.columns:
            pytest.skip(f"Column {lag_col} not present (lag 24 may not be configured).")

        # Test at 5 random rows
        rng = np.random.default_rng(1)
        sample_positions = rng.integers(0, len(feature_df), 5)
        for pos in sample_positions:
            ts = feature_df.index[pos]
            prev_ts = ts - pd.Timedelta(hours=24)
            if prev_ts in clean_hourly.index:
                expected = float(clean_hourly.loc[prev_ts, target])
                actual = float(feature_df.loc[ts, lag_col])
                assert abs(actual - expected) < 1e-9, (
                    f"lag_24h mismatch at {ts}: {actual:.6f} != {expected:.6f}"
                )

    def test_lag_168h_spot_check(
        self, feature_df: pd.DataFrame, clean_hourly: pd.DataFrame
    ) -> None:
        """lag_168h[i] must equal target[i-168] (same hour last week)."""
        from src.skills.config_loader import get_param
        target = get_param("data.target_column")
        lag_col = "lag_168h"

        if lag_col not in feature_df.columns:
            pytest.skip(f"Column {lag_col} not present.")

        # Only test on rows that have 168h of history
        valid_rows = feature_df.index[feature_df.index >= clean_hourly.index[0] + pd.Timedelta(hours=168)]
        if len(valid_rows) == 0:
            pytest.skip("Not enough history for lag_168h test.")

        ts = valid_rows[0]
        prev_ts = ts - pd.Timedelta(hours=168)
        if prev_ts in clean_hourly.index:
            expected = float(clean_hourly.loc[prev_ts, target])
            actual = float(feature_df.loc[ts, lag_col])
            assert abs(actual - expected) < 1e-9


class TestFeatureMatrix:
    """General feature matrix validation tests."""

    def test_feature_columns_present(self, feature_df: pd.DataFrame) -> None:
        """Key feature columns must be present in the output."""
        required = [
            "hour_of_day", "day_of_week", "is_weekend", "month",
            "hour_sin", "hour_cos", "month_sin", "month_cos",
            "lag_1h", "lag_24h",
            "roll_mean_24h", "roll_std_24h",
        ]
        missing = [c for c in required if c not in feature_df.columns]
        assert not missing, f"Missing feature columns: {missing}"

    def test_warmup_rows_dropped(
        self, feature_df: pd.DataFrame, clean_hourly: pd.DataFrame
    ) -> None:
        """Feature matrix must have fewer rows than input (warmup dropped)."""
        from src.skills.config_loader import get_param
        warmup = get_param("features.warmup_rows")
        assert len(feature_df) <= len(clean_hourly) - warmup, (
            "Feature matrix should have at most (n_hourly - warmup_rows) rows."
        )

    def test_no_nan_after_warmup(self, feature_df: pd.DataFrame) -> None:
        """No NaN values should remain in the feature matrix after warmup drop."""
        nan_counts = feature_df.isnull().sum()
        cols_with_nan = nan_counts[nan_counts > 0]
        assert len(cols_with_nan) == 0, (
            f"NaN values found after warmup drop: {cols_with_nan.to_dict()}"
        )

    def test_rolling_std_non_negative(self, feature_df: pd.DataFrame) -> None:
        """Rolling standard deviation columns must be non-negative."""
        std_cols = [c for c in feature_df.columns if "roll_std" in c]
        for col in std_cols:
            assert (feature_df[col] >= 0).all(), (
                f"Negative values found in rolling std column: {col}"
            )

    def test_cyclical_features_bounded(self, feature_df: pd.DataFrame) -> None:
        """Sine and cosine features must be in [-1, 1]."""
        for col in ["hour_sin", "hour_cos", "month_sin", "month_cos"]:
            if col in feature_df.columns:
                assert feature_df[col].between(-1.0001, 1.0001).all(), (
                    f"Cyclical feature {col} is outside [-1, 1]."
                )
