"""
src.ingestion.load
==================
Load the raw UCI Individual Household Electric Power Consumption dataset.

The raw file is a semicolon-delimited text file (~2,075,259 rows) with
missing values encoded as '?'.  This module reads the file into a pandas
DataFrame, parses the Date+Time columns into a single ``datetime`` index,
and logs basic shape and null-count statistics.

Usage::

    python -m src.ingestion.load

The DataFrame is returned by ``load_raw()`` for use by downstream modules.
Nothing is written to disk here; persistence is handled in ``clean.py``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_raw(path: Optional[str | Path] = None) -> pd.DataFrame:
    """Read the raw UCI CSV into a pandas DataFrame with a datetime index.

    Parameters
    ----------
    path : str | Path | None
        Path to the raw text file.  Defaults to the value of
        ``paths.raw_csv`` in ``configs/params.yaml``.

    Returns
    -------
    pd.DataFrame
        ~2,075,259 rows x 9 columns (Date and Time merged into the index).
        Dtypes are float64 for all numeric columns; '?' has been replaced
        with ``NaN``.

    Raises
    ------
    FileNotFoundError
        If the raw file does not exist at the resolved path.
    """
    resolved_path = _resolve_path(path)
    logger.info("Loading raw dataset from %s", resolved_path)

    df = pd.read_csv(
        resolved_path,
        sep=";",
        na_values=get_param("data.na_sentinel"),
        parse_dates={"datetime": ["Date", "Time"]},
        dayfirst=True,
        low_memory=False,
    )

    df = df.set_index("datetime").sort_index()

    _log_summary(df)
    return df


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _resolve_path(path: Optional[str | Path]) -> Path:
    """Return the resolved file path, falling back to params.yaml default."""
    if path is not None:
        return Path(path)
    raw_csv: str = get_param("paths.raw_csv")
    # Resolve relative to the project root (parent of src/)
    project_root = Path(__file__).resolve().parents[2]
    return project_root / raw_csv


def _log_summary(df: pd.DataFrame) -> None:
    """Log shape, date range, and per-column null counts."""
    null_counts = df.isnull().sum()
    logger.info(
        "Loaded DataFrame: %d rows x %d columns | date range: %s to %s",
        len(df),
        df.shape[1],
        df.index.min(),
        df.index.max(),
    )
    logger.info("Null counts per column:\n%s", null_counts.to_string())


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    cfg = load_config()  # Eager load to surface config errors early
    df = load_raw()
    print(df.head())
    print(f"\nShape: {df.shape}")
    print(f"Null counts:\n{df.isnull().sum()}")
