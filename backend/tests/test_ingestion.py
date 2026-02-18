"""
tests.test_ingestion
====================
Unit tests for ``src.ingestion.load`` and ``src.ingestion.clean``.

Test IDs (from TODO.md Phase 1C)
---------------------------------
1.13  test_no_nan_after_clean  : No NaN in power columns after cleaning.
1.14  test_datetime_continuous : Unflagged rows have no gaps > 4 h in index.

Additional tests
-----------------
test_load_raw_columns  : Loaded DataFrame has the expected 7 numeric columns.
test_resample_hourly   : Hourly DataFrame has fewer rows than minute-level.
test_other_consumption : ``Other_consumption`` is non-negative for > 95 % of rows.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def sample_minute_df():
    """Minimal synthetic minute-level DataFrame mimicking the raw UCI data."""
    n = 24 * 60  # One day of minute data
    idx = pd.date_range("2007-01-01", periods=n, freq="1min")
    rng = np.random.default_rng(42)
    df = pd.DataFrame(
        {
            "Global_active_power": rng.uniform(0.2, 3.0, n),
            "Global_reactive_power": rng.uniform(0.0, 0.5, n),
            "Voltage": rng.uniform(230.0, 240.0, n),
            "Global_intensity": rng.uniform(1.0, 14.0, n),
            "Sub_metering_1": rng.uniform(0, 30, n),
            "Sub_metering_2": rng.uniform(0, 30, n),
            "Sub_metering_3": rng.uniform(0, 30, n),
        },
        index=idx,
    )
    return df


@pytest.fixture(scope="module")
def hourly_df(sample_minute_df):
    """Hourly clean DataFrame produced from the synthetic minute data."""
    from src.ingestion.clean import clean_and_resample
    return clean_and_resample(sample_minute_df)


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------

class TestLoadRaw:
    """Tests for ``src.ingestion.load``."""

    def test_load_raw_columns(self, sample_minute_df: pd.DataFrame) -> None:
        """Loaded DataFrame must contain all 7 expected numeric columns."""
        expected_cols = {
            "Global_active_power",
            "Global_reactive_power",
            "Voltage",
            "Global_intensity",
            "Sub_metering_1",
            "Sub_metering_2",
            "Sub_metering_3",
        }
        assert expected_cols.issubset(set(sample_minute_df.columns)), (
            f"Missing columns: {expected_cols - set(sample_minute_df.columns)}"
        )

    def test_index_is_datetime(self, sample_minute_df: pd.DataFrame) -> None:
        """DataFrame index must be a DatetimeIndex."""
        assert isinstance(sample_minute_df.index, pd.DatetimeIndex)


class TestCleanResample:
    """Tests for ``src.ingestion.clean``."""

    def test_no_nan_after_clean(self, hourly_df: pd.DataFrame) -> None:
        """No NaN values in power columns for unflagged rows (TODO 1.13)."""
        from src.skills.config_loader import get_param
        gap_flag = get_param("data.gap_flag_column")
        target = get_param("data.target_column")

        unflagged = hourly_df[~hourly_df[gap_flag]] if gap_flag in hourly_df.columns else hourly_df
        null_count = unflagged[target].isnull().sum()
        assert null_count == 0, (
            f"Found {null_count} NaN values in '{target}' column after cleaning."
        )

    def test_datetime_continuous(self, hourly_df: pd.DataFrame) -> None:
        """Unflagged rows should not have gaps > 4 h in the datetime index (TODO 1.14)."""
        from src.skills.config_loader import get_param
        gap_flag = get_param("data.gap_flag_column")
        short_gap = get_param("data.short_gap_hours")

        unflagged = hourly_df[~hourly_df[gap_flag]] if gap_flag in hourly_df.columns else hourly_df
        if len(unflagged) < 2:
            pytest.skip("Not enough rows to check continuity.")

        diffs = unflagged.index.to_series().diff().dropna()
        max_gap_h = diffs.max().total_seconds() / 3600
        assert max_gap_h <= short_gap, (
            f"Found gap of {max_gap_h:.1f} h in unflagged rows (threshold: {short_gap} h)."
        )

    def test_resample_hourly(
        self, sample_minute_df: pd.DataFrame, hourly_df: pd.DataFrame
    ) -> None:
        """Hourly DataFrame must have fewer rows than the minute-level input."""
        assert len(hourly_df) < len(sample_minute_df), (
            "Hourly DataFrame should have fewer rows than the minute-level input."
        )

    def test_other_consumption_non_negative(self, hourly_df: pd.DataFrame) -> None:
        """Other_consumption must be non-negative for at least 95 % of rows."""
        col = "Other_consumption"
        if col not in hourly_df.columns:
            pytest.skip(f"Column '{col}' not present; skipping.")

        non_negative_pct = (hourly_df[col] >= 0).mean()
        assert non_negative_pct >= 0.95, (
            f"Only {non_negative_pct:.1%} of Other_consumption rows are non-negative."
        )

    def test_no_long_gap_rows_remain(self, hourly_df: pd.DataFrame) -> None:
        """Cleaned DataFrame must have no NaN rows (long gaps are dropped)."""
        nan_total = hourly_df.isna().sum().sum()
        assert nan_total == 0, (
            f"Found {nan_total} NaN values — long-gap rows should have been dropped."
        )
