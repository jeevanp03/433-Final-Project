"""
src.ingestion.clean
===================
Clean the raw minute-level DataFrame and produce a clean hourly Parquet file.

Pipeline steps:
1. Resample minute data to hourly (power columns: mean; sub-metering: sum).
2. Compute the derived ``Other_consumption`` column.
3. Identify consecutive NaN runs.
4. Short gaps (<= 4 h): forward-fill then backward-fill.
5. Long gaps (> 4 h): set ``gap_flag = True`` and leave for downstream exclusion.
6. Assert no NaN remains in numeric columns.
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
        Hourly DataFrame with ``gap_flag`` boolean column.  Approximately
        35,000 rows.
    """
    if df is None:
        df = load_raw()

    logger.info("Starting hourly resampling …")
    hourly = _resample_to_hourly(df)
    hourly = _add_other_consumption(hourly)
    hourly = _fill_gaps(hourly)
    _assert_no_nan(hourly)
    logger.info("Clean hourly DataFrame: %d rows x %d columns", *hourly.shape)
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
        Cleaned hourly DataFrame.
    path : str | Path | None
        Output path.  Defaults to ``paths.quality_report`` from params.yaml.

    Returns
    -------
    Path
        Resolved path of the saved JSON file.
    """
    resolved = _resolve_output_path(path, "paths.quality_report")
    resolved.parent.mkdir(parents=True, exist_ok=True)

    gap_flag_col: str = get_param("data.gap_flag_column")
    long_gap_rows = int(df[gap_flag_col].sum()) if gap_flag_col in df.columns else 0

    report = {
        "total_rows": len(df),
        "long_gap_rows_flagged": long_gap_rows,
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
            if col != gap_flag_col
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
    )
    return df


def _fill_gaps(df: pd.DataFrame) -> pd.DataFrame:
    """Fill short NaN runs; flag long runs with ``gap_flag``."""
    short_gap: int = get_param("data.short_gap_hours")
    gap_flag_col: str = get_param("data.gap_flag_column")

    numeric_cols = df.select_dtypes("number").columns.tolist()

    # Identify consecutive NaN run lengths for the target column
    target: str = get_param("data.target_column")
    null_mask = df[target].isnull()
    gap_groups = null_mask * (null_mask.groupby((~null_mask).cumsum()).cumcount() + 1)

    # Mark long-gap rows before filling
    df = df.copy()
    df[gap_flag_col] = False

    # Forward fill then backward fill for short gaps
    df[numeric_cols] = (
        df[numeric_cols]
        .where(~(null_mask & (gap_groups > short_gap)))  # preserve long gaps
        .ffill()
        .bfill()
    )

    # Flag any remaining NaN rows as long gaps
    still_null = df[target].isnull()
    df.loc[still_null, gap_flag_col] = True

    long_gaps = int(still_null.sum())
    if long_gaps:
        logger.warning(
            "%d hourly rows have gaps > %d h and are flagged (not filled).",
            long_gaps,
            short_gap,
        )
    return df


def _assert_no_nan(df: pd.DataFrame) -> None:
    """Assert that no NaN values remain in filled numeric columns."""
    target: str = get_param("data.target_column")
    gap_flag_col: str = get_param("data.gap_flag_column")

    unflagged = df[~df[gap_flag_col]] if gap_flag_col in df.columns else df
    nan_count = unflagged[target].isnull().sum()
    assert nan_count == 0, (
        f"Found {nan_count} NaN values in '{target}' after gap-filling. "
        "Check short_gap_hours setting in params.yaml."
    )


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
