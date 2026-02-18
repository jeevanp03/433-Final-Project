"""
src.models.conformal
====================
Conformal prediction interval computation.

Method: split conformal prediction.
1. Compute residuals on the validation set for each horizon h = 1 .. 24.
2. The half-width for horizon h is the ``quantile``-th quantile of
   |residual_h| on the validation set.
3. Prediction interval at forecast time: [y_hat - width_h, y_hat + width_h].

Target coverage: 90 % (verified in test_models.py with min 85 % on test set).

Output file: ``models/conformal_widths.json``
    {
        "h1": 0.142,
        "h2": 0.198,
        ...
        "h24": 0.312
    }

Usage::

    python -m src.models.conformal
"""

from __future__ import annotations

import json
import logging
import pathlib
from typing import Optional

import numpy as np
import pandas as pd

from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def compute_conformal_widths(
    y_val: pd.Series,
    y_pred_val: np.ndarray,
) -> dict[str, float]:
    """Compute conformal half-widths for each forecast horizon.

    Parameters
    ----------
    y_val : pd.Series
        Validation ground-truth targets (aligned with y_pred_val rows).
    y_pred_val : np.ndarray
        Shape ``(n_val_rows, horizons)`` — validation predictions from
        the XGBoost model.

    Returns
    -------
    dict[str, float]
        Mapping ``"h{h}"`` -> half-width value for h = 1 .. horizons.
    """
    quantile: float = get_param("conformal.quantile")
    horizons: int = y_pred_val.shape[1]
    widths: dict[str, float] = {}

    for h in range(1, horizons + 1):
        y_true_h = y_val.shift(-h).dropna()
        preds_h = y_pred_val[: len(y_true_h), h - 1]
        residuals = np.abs(y_true_h.values - preds_h)
        width = float(np.quantile(residuals, quantile))
        widths[f"h{h}"] = width

    logger.info(
        "Conformal widths computed for %d horizons (quantile=%.2f). "
        "h1=%.4f, h24=%.4f",
        horizons,
        quantile,
        widths.get("h1", float("nan")),
        widths.get(f"h{horizons}", float("nan")),
    )
    return widths


def save_conformal_widths(
    widths: dict[str, float],
    path: Optional[str | pathlib.Path] = None,
) -> pathlib.Path:
    """Persist conformal widths to JSON.

    Parameters
    ----------
    widths : dict[str, float]
        Mapping from ``"h{h}"`` to half-width float.
    path : str | Path | None
        Output path.  Defaults to ``paths.conformal_widths`` in params.yaml.

    Returns
    -------
    pathlib.Path
        Resolved output path.
    """
    resolved = _resolve_output_path(path)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    with open(resolved, "w") as fh:
        json.dump(widths, fh, indent=2)
    logger.info("Saved conformal widths to %s", resolved)
    return resolved


def load_conformal_widths(
    path: Optional[str | pathlib.Path] = None,
) -> dict[str, float]:
    """Load conformal widths from JSON.

    Parameters
    ----------
    path : str | Path | None
        JSON file path.  Defaults to ``paths.conformal_widths`` in params.yaml.

    Returns
    -------
    dict[str, float]
    """
    resolved = _resolve_output_path(path)
    with open(resolved) as fh:
        return json.load(fh)


def apply_intervals(
    y_pred: np.ndarray,
    widths: dict[str, float],
) -> tuple[np.ndarray, np.ndarray]:
    """Apply conformal widths to point forecasts to produce intervals.

    Parameters
    ----------
    y_pred : np.ndarray
        Shape ``(n, horizons)`` point forecasts.
    widths : dict[str, float]
        Conformal half-widths keyed ``"h{h}"``.

    Returns
    -------
    tuple[np.ndarray, np.ndarray]
        lower, upper — each shape ``(n, horizons)``.
    """
    width_vec = np.array([widths[f"h{h}"] for h in range(1, y_pred.shape[1] + 1)])
    lower = y_pred - width_vec
    upper = y_pred + width_vec
    return lower, upper


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_output_path(path: Optional[str | pathlib.Path]) -> pathlib.Path:
    if path is not None:
        return pathlib.Path(path)
    project_root = pathlib.Path(__file__).resolve().parents[2]
    return project_root / get_param("paths.conformal_widths")


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    project_root = pathlib.Path(__file__).resolve().parents[2]
    df = pd.read_parquet(project_root / get_param("paths.features_parquet"))

    from src.skills.temporal_split import get_splits
    from src.models.xgb import XGBForecaster

    splits = get_splits(df)
    model = XGBForecaster.load()

    y_pred_val = model.predict(splits["X_val"])
    widths = compute_conformal_widths(splits["y_val"], y_pred_val)
    save_conformal_widths(widths)
    print("Conformal widths:", widths)
