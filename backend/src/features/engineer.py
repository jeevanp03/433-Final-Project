"""
src.features.engineer
=====================
Build the full feature matrix from the clean hourly Parquet file.

Feature groups produced:
- Calendar features   : hour_of_day, day_of_week, is_weekend, month,
                        is_holiday, hour_sin/cos, month_sin/cos
- Lag features        : lag_1h, lag_2h, lag_24h, lag_168h (strictly past)
- Difference features : diff_1h, diff_24h
- Rolling statistics  : roll_mean/std/max_24h, roll_mean/std_168h,
                        ewma_12h (all shifted by 1 to prevent leakage)
- Sub-meter shares    : sub1/2/3/other_share, sub3_lag24_diff

Critical leakage invariant: every feature at row i uses only data from
timestamps strictly before index[i].  All lag indices k >= 1 and all
rolling windows apply .shift(1) before computing the window.

Usage::

    python -m src.features.engineer
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from src.skills.config_loader import get_param, load_config
from src.skills.french_holidays import is_holiday
from src.skills.logger import get_logger

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def build_features(df: Optional[pd.DataFrame] = None) -> pd.DataFrame:
    """Build the full feature matrix from the clean hourly DataFrame.

    Parameters
    ----------
    df : pd.DataFrame | None
        Clean hourly DataFrame from ``clean.py``.  If ``None``, the Parquet
        file at ``paths.hourly_parquet`` is loaded automatically.

    Returns
    -------
    pd.DataFrame
        Feature matrix with the target column preserved as
        ``Global_active_power``.  The first ``warmup_rows`` rows are dropped
        to eliminate NaN from lag/rolling warmup.
    """
    if df is None:
        df = _load_hourly()

    logger.info("Building features from %d hourly rows …", len(df))

    df = _add_calendar_features(df)
    df = _add_lag_features(df)
    df = _add_diff_features(df)
    df = _add_rolling_features(df)
    df = _add_sub_meter_shares(df)
    df = _drop_warmup(df)

    logger.info("Feature matrix: %d rows x %d columns", *df.shape)
    return df


def save_features(df: pd.DataFrame, path: Optional[str | Path] = None) -> Path:
    """Save the feature matrix to Parquet.

    Parameters
    ----------
    df : pd.DataFrame
        Feature matrix from ``build_features()``.
    path : str | Path | None
        Output path.  Defaults to ``paths.features_parquet`` in params.yaml.

    Returns
    -------
    Path
        Resolved path of the saved file.
    """
    resolved = _resolve_output_path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(resolved, engine="pyarrow", compression="snappy")
    logger.info("Saved features to %s", resolved)
    return resolved


# ---------------------------------------------------------------------------
# Feature builders (each returns a copy with new columns added)
# ---------------------------------------------------------------------------

def _add_calendar_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add hour, day, month, weekend, holiday, and cyclical calendar features."""
    df = df.copy()
    idx = df.index

    df["hour_of_day"] = idx.hour
    df["day_of_week"] = idx.dayofweek       # 0=Monday, 6=Sunday
    df["is_weekend"]  = (df["day_of_week"] >= 5).astype(int)
    df["month"]       = idx.month
    df["is_holiday"]  = idx.to_series().apply(lambda ts: int(is_holiday(ts.date()))).values

    # Cyclical encoding (avoids discontinuity at 23->0 and Dec->Jan)
    df["hour_sin"]   = np.sin(2 * math.pi * df["hour_of_day"] / 24)
    df["hour_cos"]   = np.cos(2 * math.pi * df["hour_of_day"] / 24)
    df["month_sin"]  = np.sin(2 * math.pi * (df["month"] - 1) / 12)
    df["month_cos"]  = np.cos(2 * math.pi * (df["month"] - 1) / 12)

    return df


def _add_lag_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add lag features for configured lag indices (all >= 1)."""
    lags: list[int] = get_param("features.lags")
    target: str = get_param("data.target_column")
    df = df.copy()
    for k in lags:
        df[f"lag_{k}h"] = df[target].shift(k)
    return df


def _add_diff_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add first-difference features between pairs of lags."""
    diff_pairs: list[list[int]] = get_param("features.diffs")
    target: str = get_param("data.target_column")
    df = df.copy()
    for pair in diff_pairs:
        k1, k2 = pair[0], pair[1]
        col_name = f"diff_{k1}h" if k2 == k1 + 1 else f"diff_{k1}_{k2}h"
        df[col_name] = df[target].shift(k1) - df[target].shift(k2)
    return df


def _add_rolling_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add rolling statistics (shifted by 1 to prevent leakage) and EWMA."""
    windows: list[int] = get_param("features.rolling_windows")
    halflife: int = get_param("features.ewma_halflife_hours")
    target: str = get_param("data.target_column")
    df = df.copy()

    # Shift by 1 first so window does not include current row
    shifted = df[target].shift(1)

    for w in windows:
        rolled = shifted.rolling(window=w, min_periods=max(1, w // 2))
        df[f"roll_mean_{w}h"] = rolled.mean()
        df[f"roll_std_{w}h"]  = rolled.std()
        if w == 24:
            df[f"roll_max_{w}h"] = rolled.max()

    # Exponentially weighted moving average (halflife in hours)
    df[f"ewma_{halflife}h"] = shifted.ewm(halflife=halflife, adjust=False).mean()

    return df


def _add_sub_meter_shares(df: pd.DataFrame) -> pd.DataFrame:
    """Add sub-meter share and lag-difference features.

    Shares are sub_i / Global_active_power.  When Global_active_power < the
    configured minimum, shares are set to 0 to avoid division by zero.
    """
    min_kw: float = get_param("features.sub_meter_share_min_kw")
    df = df.copy()

    safe_denom = df["Global_active_power"].replace(0, np.nan)
    safe_denom = safe_denom.where(safe_denom >= min_kw, np.nan)

    sub_cols = {
        "sub1_share": "Sub_metering_1",
        "sub2_share": "Sub_metering_2",
        "sub3_share": "Sub_metering_3",
    }

    for feature_col, raw_col in sub_cols.items():
        if raw_col in df.columns:
            df[feature_col] = (df[raw_col] / safe_denom).fillna(0.0)

    if "Sub_metering_3" in df.columns:
        df["other_share"] = 1.0 - (
            df["sub1_share"] + df["sub2_share"] + df["sub3_share"]
        )
        # Sub_metering_3 lag-24h difference (uses strictly past values)
        df["sub3_lag24_diff"] = (
            df["Sub_metering_3"].shift(1) - df["Sub_metering_3"].shift(25)
        )

    return df


def _drop_warmup(df: pd.DataFrame) -> pd.DataFrame:
    """Drop the first ``warmup_rows`` rows where lag/rolling features are NaN."""
    warmup: int = get_param("features.warmup_rows")
    df_trimmed = df.iloc[warmup:].copy()
    remaining_nans = df_trimmed.isnull().any(axis=1).sum()
    if remaining_nans:
        logger.warning(
            "%d rows still contain NaN after warmup drop. "
            "Consider increasing features.warmup_rows.",
            remaining_nans,
        )
    return df_trimmed


# ---------------------------------------------------------------------------
# I/O helpers
# ---------------------------------------------------------------------------

def _load_hourly() -> pd.DataFrame:
    """Load the clean hourly Parquet from the path in params.yaml."""
    project_root = Path(__file__).resolve().parents[2]
    parquet_path = project_root / get_param("paths.hourly_parquet")
    logger.info("Loading clean hourly Parquet from %s", parquet_path)
    return pd.read_parquet(parquet_path, engine="pyarrow")


def _resolve_output_path(path: Optional[str | Path]) -> Path:
    if path is not None:
        return Path(path)
    project_root = Path(__file__).resolve().parents[2]
    return project_root / get_param("paths.features_parquet")


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    features_df = build_features()
    save_features(features_df)
    print(f"Done. Feature matrix shape: {features_df.shape}")
    print(features_df.dtypes)
