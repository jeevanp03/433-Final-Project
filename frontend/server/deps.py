"""
Shared dependencies for the FastAPI server.

Lazily loads models, data, and configuration on first access.
All backend imports resolve via PYTHONPATH=../../backend (set in main.py).
"""

from __future__ import annotations

import sys
from functools import lru_cache
from pathlib import Path

# Ensure backend is importable
_backend_root = Path(__file__).resolve().parents[1].parent / "backend"
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

import numpy as np
import pandas as pd

from src.skills.config_loader import get_param, load_config

# Ensure config is loaded
load_config()


@lru_cache(maxsize=1)
def get_hourly_data() -> pd.DataFrame:
    """Load the cleaned hourly Parquet."""
    project_root = _backend_root
    path = project_root / get_param("paths.hourly_parquet")
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def get_features() -> pd.DataFrame:
    """Load the feature matrix Parquet."""
    project_root = _backend_root
    path = project_root / get_param("paths.features_parquet")
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def get_xgb_model():
    """Load pre-trained XGBoost forecaster."""
    from src.models.xgb import XGBForecaster

    return XGBForecaster.load()


@lru_cache(maxsize=1)
def get_ridge_model():
    """Load pre-trained Ridge forecaster."""
    from src.models.ridge import RidgeForecaster

    return RidgeForecaster.load()


@lru_cache(maxsize=1)
def get_conformal_widths() -> dict[str, float]:
    """Load conformal prediction widths."""
    from src.models.conformal import load_conformal_widths

    return load_conformal_widths()


@lru_cache(maxsize=1)
def get_shap_values() -> pd.DataFrame:
    """Load pre-computed SHAP values."""
    project_root = _backend_root
    path = project_root / get_param("paths.shap_values_parquet")
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def get_backtest_results() -> pd.DataFrame:
    """Load backtest results."""
    project_root = _backend_root
    path = project_root / get_param("paths.backtest_results")
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def get_validation_metrics() -> pd.DataFrame:
    """Load validation metrics."""
    project_root = _backend_root
    path = project_root / get_param("paths.validation_metrics")
    return pd.read_csv(path, index_col=0)


@lru_cache(maxsize=1)
def get_test_metrics() -> pd.DataFrame:
    """Load test metrics."""
    project_root = _backend_root
    path = project_root / get_param("paths.test_metrics")
    return pd.read_csv(path, index_col=0)


def get_target_column() -> str:
    return get_param("data.target_column")


def predict_forecast(
    origin_idx: int,
    model_name: str = "xgboost",
    horizon: int = 24,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Generate point forecast + prediction intervals from a feature row index.

    Returns (point, lower, upper) arrays each of shape (horizon,).
    """
    from src.models.conformal import apply_intervals

    features = get_features()
    target = get_target_column()
    X = features.iloc[[origin_idx]].drop(columns=[target], errors="ignore")

    if model_name == "xgboost":
        model = get_xgb_model()
    elif model_name == "ridge":
        model = get_ridge_model()
    else:
        raise ValueError(f"Unknown model: {model_name}")

    preds_2d = model.predict(X)  # shape (1, 24)
    point = preds_2d[0, :horizon]

    widths = get_conformal_widths()
    width_arr = np.array([widths.get(f"h{h}", 0.3) for h in range(1, horizon + 1)])
    lower = point - width_arr
    upper = point + width_arr

    return point, lower, upper
