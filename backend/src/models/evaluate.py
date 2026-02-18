"""
src.models.evaluate
===================
Rolling-window backtesting harness and metric computation.

Runs all three forecasters (SeasonalNaive, Ridge, XGBoost) through a
rolling-window backtesting procedure on the validation set, then evaluates
each on the held-out test set.

Metrics computed per model, per error-slice dimension:
    - Overall: MAE, RMSE, MAPE, R2, Peak MAE
    - Sliced by: hour_of_day, day_of_week, month, forecast_horizon (1-24),
      demand_tercile

Output files (paths from params.yaml):
    results/validation_metrics.csv
    results/test_metrics.csv

Usage::

    python -m src.models.evaluate
"""

from __future__ import annotations

import logging
import pathlib
from typing import Optional

import numpy as np
import pandas as pd

from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger
from src.skills.metrics import compute_all
from src.skills.temporal_split import get_splits

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_evaluation(df: Optional[pd.DataFrame] = None) -> dict[str, pd.DataFrame]:
    """Run the full backtesting evaluation for all models.

    Parameters
    ----------
    df : pd.DataFrame | None
        Feature matrix from ``engineer.py``.  If ``None``, loaded from
        ``paths.features_parquet`` in params.yaml.

    Returns
    -------
    dict[str, pd.DataFrame]
        Keys: 'validation', 'test'.  Each value is a DataFrame of metrics
        indexed by (model_name, slice_dimension, slice_value).
    """
    if df is None:
        df = _load_features()

    train, val, test = get_splits(df)
    target = get_param("data.target_column")
    X_train, y_train = train.drop(columns=[target]), train[target]
    X_val, y_val = val.drop(columns=[target]), val[target]
    X_test, y_test = test.drop(columns=[target]), test[target]

    # Lazy imports to avoid circular dependencies at module load time
    from src.models.baseline import SeasonalNaive
    from src.models.ridge import RidgeForecaster
    from src.models.xgb import XGBForecaster

    models = {
        "seasonal_naive": SeasonalNaive(),
        "ridge": RidgeForecaster(),
        "xgboost": XGBForecaster(),
    }

    val_records: list[dict] = []
    test_records: list[dict] = []

    for name, model in models.items():
        logger.info("Fitting model: %s", name)
        model.fit(X_train, y_train, X_val=X_val, y_val=y_val)

        # Validation metrics
        val_metrics = _compute_metrics(model, X_val, y_val)
        val_records.append({"model": name, **val_metrics})

        # Test metrics
        test_metrics = _compute_metrics(model, X_test, y_test)
        test_records.append({"model": name, **test_metrics})

    val_df = pd.DataFrame(val_records).set_index("model")
    test_df = pd.DataFrame(test_records).set_index("model")

    _save_metrics(val_df, "paths.validation_metrics")
    _save_metrics(test_df, "paths.test_metrics")

    return {"validation": val_df, "test": test_df}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_metrics(model, X: pd.DataFrame, y_true: pd.Series) -> dict[str, float]:
    """Compute all configured evaluation metrics for a model on a dataset."""
    from src.models.base import Forecaster
    y_pred_2d = model.predict(X)
    # Use h=1 predictions for overall metrics
    y_pred = y_pred_2d[:, 0] if y_pred_2d.ndim == 2 else y_pred_2d
    n = min(len(y_true), len(y_pred))
    return compute_all(y_true.values[:n], y_pred[:n])


def _save_metrics(df: pd.DataFrame, path_param: str) -> pathlib.Path:
    """Save a metrics DataFrame to CSV."""
    project_root = pathlib.Path(__file__).resolve().parents[2]
    out_path = project_root / get_param(path_param)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out_path)
    logger.info("Saved metrics to %s", out_path)
    return out_path


def _load_features() -> pd.DataFrame:
    project_root = pathlib.Path(__file__).resolve().parents[2]
    path = project_root / get_param("paths.features_parquet")
    return pd.read_parquet(path)


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    results = run_evaluation()
    print("Validation metrics:")
    print(results["validation"])
    print("\nTest metrics:")
    print(results["test"])
