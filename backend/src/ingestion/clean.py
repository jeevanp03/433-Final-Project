"""
src.ingestion.clean
===================
Clean the raw minute-level DataFrame and produce a clean hourly Parquet file.

Pipeline steps:
1. Resample minute data to hourly (power columns: mean; sub-metering: sum).
2. Compute the derived ``Other_consumption`` column.
3. Identify consecutive NaN runs BEFORE any filling.
4. Short gaps (<= 4 h): forward-fill then backward-fill.
5. Long gaps (> 4 h): drop the rows entirely (do not impute).
6. Assert no NaN remains, index is monotonic, no duplicate timestamps.
7. Save ``data/processed/hourly_clean.parquet``.
8. Save ``data/processed/quality_report.json``.

All thresholds and file paths are read from ``configs/params.yaml``.

Usage::

    python -m src.ingestion.clean
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger
from src.ingestion.load import load_raw

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def clean_and_resample(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """Resample minute data to hourly and apply gap-filling rules.

    Parameters
    ----------
    df : pd.DataFrame | None
        Raw minute-level DataFrame from ``load_raw()``.  If ``None``,
        ``load_raw()`` is called automatically.

    Returns
    -------
    pd.DataFrame
        Hourly DataFrame with long-gap rows excluded entirely.
        Short gaps (<=4 h) are forward- then backward-filled.
        Approximately 35,000 rows with no NaN values.
    """
    if df is None:
        df = load_raw()

    logger.info("Starting hourly resampling …")
    hourly = _resample_to_hourly(df)
    rows_before = len(hourly)
    hourly = _add_other_consumption(hourly)
    hourly, n_short_filled, n_long_dropped = _fill_gaps(hourly)

    # Store metadata as attributes for use in quality report
    hourly.attrs["rows_before_cleaning"] = rows_before
    hourly.attrs["short_gaps_filled"] = n_short_filled
    hourly.attrs["long_gaps_dropped"] = n_long_dropped

    _assert_clean(hourly)
    logger.info(
        "Clean hourly DataFrame: %d rows x %d columns "
        "(%d short gaps filled, %d long-gap rows dropped)",
        *hourly.shape,
        n_short_filled,
        n_long_dropped,
    )
    return hourly


def save_parquet(df: pd.DataFrame, path: Optional[str | Path] = None) -> Path:
    """Persist the cleaned DataFrame to Parquet.

    Parameters
    ----------
    df : pd.DataFrame
        Cleaned hourly DataFrame produced by ``clean_and_resample()``.
    path : str | Path | None
        Output path.  Defaults to ``paths.hourly_parquet`` from params.yaml.

    Returns
    -------
    Path
        Resolved path where the file was saved.
    """
    resolved = _resolve_output_path(path, "paths.hourly_parquet")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(resolved, engine="pyarrow", compression="snappy")
    logger.info("Saved hourly Parquet to %s", resolved)
    return resolved


def save_quality_report(df: pd.DataFrame, path: Optional[str | Path] = None) -> Path:
    """Write a JSON quality report summarising the cleaning step.

    Parameters
    ----------
    df : pd.DataFrame
        Cleaned hourly DataFrame produced by ``clean_and_resample()``.
        May carry ``attrs`` keys: ``rows_before_cleaning``,
        ``short_gaps_filled``, ``long_gaps_dropped``.
    path : str | Path | None
        Output path.  Defaults to ``paths.quality_report`` from params.yaml.

    Returns
    -------
    Path
        Resolved path of the saved JSON file.
    """
    resolved = _resolve_output_path(path, "paths.quality_report")
    resolved.parent.mkdir(parents=True, exist_ok=True)

    rows_before = df.attrs.get("rows_before_cleaning", None)
    short_filled = df.attrs.get("short_gaps_filled", None)
    long_dropped = df.attrs.get("long_gaps_dropped", None)

    report = {
        "rows_before_cleaning": rows_before,
        "rows_after_cleaning": len(df),
        "short_gaps_filled_hours": short_filled,
        "long_gap_rows_dropped": long_dropped,
        "date_range": {
            "start": str(df.index.min()),
            "end": str(df.index.max()),
        },
        "column_stats": {
            col: {
                "min": float(df[col].min()),
                "max": float(df[col].max()),
                "mean": float(df[col].mean()),
            }
            for col in df.select_dtypes("number").columns
        },
    }

    with open(resolved, "w") as fh:
        json.dump(report, fh, indent=2)

    logger.info("Saved quality report to %s", resolved)
    return resolved


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resample_to_hourly(df: pd.DataFrame) -> pd.DataFrame:
    """Resample minute-level DataFrame to hourly using configured aggregations."""
    mean_cols: list[str] = get_param("data.mean_columns")
    sum_cols: list[str] = get_param("data.sum_columns")

    agg_rules = {col: "mean" for col in mean_cols if col in df.columns}
    agg_rules.update({col: "sum" for col in sum_cols if col in df.columns})

    hourly = df.resample("1h").agg(agg_rules)
    return hourly


def _add_other_consumption(df: pd.DataFrame) -> pd.DataFrame:
    """Add the ``Other_consumption`` derived column.

    Formula: (Global_active_power * 1000/60) * 60 - Sub_1 - Sub_2 - Sub_3
    Simplified: Global_active_power * 1000 - Sub_1 - Sub_2 - Sub_3
    """
    derived_col: str = get_param("data.derived_column")
    df = df.copy()
    df[derived_col] = (
        df["Global_active_power"] * 1000
        - df["Sub_metering_1"]
        - df["Sub_metering_2"]
        - df["Sub_metering_3"]
    ).clip(lower=0)
    return df


def _fill_gaps(df: pd.DataFrame) -> tuple[pd.DataFrame, int, int]:
    """Fill short NaN runs; drop rows belonging to long runs.

    Short gaps (<= ``short_gap_hours`` consecutive missing hours) are
    forward-filled then backward-filled.  Long gaps are identified BEFORE
    any filling, flagged, and then removed from the returned DataFrame so
    the final parquet contains no NaN values and no imputed long runs.

    Parameters
    ----------
    df : pd.DataFrame
        Hourly resampled DataFrame (with NaN where data was missing).

    Returns
    -------
    tuple of (cleaned_df, n_short_filled, n_long_dropped)
        cleaned_df     : DataFrame with short gaps filled and long-gap rows
                         removed entirely.
        n_short_filled : Number of hourly rows that were forward/back-filled.
        n_long_dropped : Number of hourly rows dropped due to long gaps.
    """
    short_gap: int = get_param("data.short_gap_hours")
    target: str = get_param("data.target_column")
    numeric_cols = df.select_dtypes("number").columns.tolist()

    df = df.copy()

    # -----------------------------------------------------------------------
    # Step 1: Identify each NaN row's consecutive run length BEFORE filling.
    # null_mask:  True wherever the target column is NaN.
    # gap_run_id: Increments every time null_mask transitions from True->False.
    #             All rows inside a single contiguous NaN run share the same id.
    # run_length: cumcount within each run (1-indexed, 0 for non-NaN rows).
    # -----------------------------------------------------------------------
    null_mask = df[target].isnull()
    gap_run_id = (~null_mask).cumsum()
    # cumcount gives 0-based position within each group; +1 gives run position
    run_position = null_mask.groupby(gap_run_id).cumcount() + 1
    # Zero out positions for non-NaN rows (groups with null_mask=False throughout)
    run_position = run_position.where(null_mask, other=0)

    # Max position within each run == run length. Broadcast back to each row.
    run_max = run_position.groupby(gap_run_id).transform("max")

    # Rows in long gaps (run length exceeds threshold)
    long_gap_mask = null_mask & (run_max > short_gap)
    # Rows in short gaps
    short_gap_mask = null_mask & (run_max <= short_gap)

    n_long_dropped = int(long_gap_mask.sum())
    n_short_filled = int(short_gap_mask.sum())

    # -----------------------------------------------------------------------
    # Step 2: Forward-fill then backward-fill SHORT gaps only.
    # We temporarily set long-gap rows to NaN (they already are), fill, then
    # verify that long-gap positions have not been touched by the fill.
    # Implementation: set long-gap rows to a sentinel, fill, then drop sentinels.
    # Simpler: fill a masked copy where long-gap rows are preserved as NaN.
    # -----------------------------------------------------------------------
    # Build a version where long-gap NaNs are preserved (they stay NaN even
    # after ffill/bfill because we mark valid sentinel boundaries around them).
    # The cleanest approach: mask short-gap rows with NaN, ffill/bfill, then
    # reassign only those rows back to df.
    if n_short_filled > 0:
        filled = df[numeric_cols].ffill().bfill()
        # Only apply filled values to short-gap rows; leave long-gap rows as NaN
        df.loc[short_gap_mask, numeric_cols] = filled.loc[short_gap_mask, numeric_cols]

    # -----------------------------------------------------------------------
    # Step 3: Drop long-gap rows entirely.
    # -----------------------------------------------------------------------
    if n_long_dropped > 0:
        logger.warning(
            "%d hourly rows dropped (gap > %d consecutive hours).",
            n_long_dropped,
            short_gap,
        )
        df = df.loc[~long_gap_mask]

    logger.info(
        "Gap filling complete: %d short-gap rows filled, %d long-gap rows dropped.",
        n_short_filled,
        n_long_dropped,
    )
    return df, n_short_filled, n_long_dropped


def _assert_clean(df: pd.DataFrame) -> None:
    """Assert data quality invariants on the cleaned hourly DataFrame.

    Checks:
    - No NaN values remain in any column.
    - DatetimeIndex is monotonically increasing.
    - No duplicate timestamps exist.

    Raises
    ------
    AssertionError
        If any invariant is violated.
    """
    nan_total = df.isna().sum().sum()
    assert nan_total == 0, (
        f"NaN values remain after cleaning: {nan_total} total across all columns."
    )
    assert df.index.is_monotonic_increasing, "Index is not monotonically increasing."
    assert not df.index.duplicated().any(), "Duplicate timestamps found in index."


def _resolve_output_path(path: Optional[str | Path], param_key: str) -> Path:
    """Resolve output path, falling back to the params.yaml entry."""
    if path is not None:
        return Path(path)
    project_root = Path(__file__).resolve().parents[2]
    return project_root / get_param(param_key)


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()  # Surface config errors early
    df_clean = clean_and_resample()
    save_parquet(df_clean)
    save_quality_report(df_clean)
    print(f"Done. Shape: {df_clean.shape}")
    print(df_clean.head())
