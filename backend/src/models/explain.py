"""
src.models.explain
==================
SHAP-based feature-importance analysis for the XGBoost forecaster.

Provides:
- ``compute_shap_values()``: run SHAP TreeExplainer on the h=1 XGBoost model.
- ``get_top_drivers()``: return the top-N SHAP contributors for a given row.
- ``save_shap_values()``: persist the SHAP matrix to Parquet.

Output files:
    results/shap_values.parquet
    results/figures/shap_summary.png

Usage::

    python -m src.models.explain
"""

from __future__ import annotations

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

def compute_shap_values(
    model,  # XGBForecaster instance
    X: pd.DataFrame,
    horizon_index: int = 0,
) -> pd.DataFrame:
    """Compute SHAP values using TreeExplainer on one horizon model.

    Parameters
    ----------
    model : XGBForecaster
        Fitted XGBoost forecaster (see src.models.xgb).
    X : pd.DataFrame
        Feature matrix on which SHAP values are computed.
    horizon_index : int
        Zero-based index of the horizon model to explain (0 = h=1).

    Returns
    -------
    pd.DataFrame
        Shape ``(len(X), n_features)`` — one SHAP value per feature per row.
        Index matches ``X.index``.
    """
    try:
        import shap
    except ImportError as exc:
        raise ImportError("shap is required. Install with: pip install shap") from exc

    model._check_is_fitted()
    target: str = get_param("data.target_column")
    feature_cols = [c for c in X.columns if c != target]

    xgb_model = model._models[horizon_index]
    explainer = shap.TreeExplainer(xgb_model)
    shap_matrix = explainer.shap_values(X[feature_cols])

    shap_df = pd.DataFrame(shap_matrix, index=X.index, columns=feature_cols)
    logger.info(
        "Computed SHAP values: %d rows x %d features", *shap_df.shape
    )
    return shap_df


def get_top_drivers(
    shap_df: pd.DataFrame,
    row_index: int | pd.Timestamp,
    n: int = 3,
) -> list[dict[str, float | str]]:
    """Return the top-N SHAP contributors for a specific forecast row.

    Parameters
    ----------
    shap_df : pd.DataFrame
        SHAP value matrix from ``compute_shap_values()``.
    row_index : int | pd.Timestamp
        Index label of the row to explain.
    n : int
        Number of top contributors to return.

    Returns
    -------
    list[dict]
        Sorted by absolute SHAP value descending.  Each dict has keys
        ``feature``, ``shap_value``, and ``direction`` ('+' or '-').
    """
    row = shap_df.loc[row_index]
    top = row.abs().nlargest(n)
    return [
        {
            "feature": feat,
            "shap_value": float(row[feat]),
            "direction": "+" if row[feat] >= 0 else "-",
        }
        for feat in top.index
    ]


def save_shap_values(
    shap_df: pd.DataFrame,
    path: Optional[str | pathlib.Path] = None,
) -> pathlib.Path:
    """Save SHAP values to Parquet.

    Parameters
    ----------
    shap_df : pd.DataFrame
        SHAP values from ``compute_shap_values()``.
    path : str | Path | None
        Output path.  Defaults to ``paths.shap_values_parquet`` in params.yaml.

    Returns
    -------
    pathlib.Path
    """
    resolved = _resolve_output_path(path, "paths.shap_values_parquet")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    shap_df.to_parquet(resolved, engine="pyarrow", compression="snappy")
    logger.info("Saved SHAP values to %s", resolved)
    return resolved


def plot_shap_summary(
    shap_df: pd.DataFrame,
    X: pd.DataFrame,
    save_path: Optional[str | pathlib.Path] = None,
) -> None:
    """Generate and save a SHAP bee-swarm summary plot.

    Parameters
    ----------
    shap_df : pd.DataFrame
        SHAP value matrix.
    X : pd.DataFrame
        Feature matrix (for feature value colouring).
    save_path : str | Path | None
        Path to save the PNG.  Defaults to ``results/figures/shap_summary.png``.
    """
    try:
        import shap
        import matplotlib.pyplot as plt
    except ImportError as exc:
        raise ImportError("shap and matplotlib are required.") from exc

    target: str = get_param("data.target_column")
    feature_cols = [c for c in X.columns if c != target]

    resolved = _resolve_figure_path(save_path, "shap_summary.png")
    resolved.parent.mkdir(parents=True, exist_ok=True)

    shap.summary_plot(
        shap_df[feature_cols].values,
        X[feature_cols],
        show=False,
    )
    plt.tight_layout()
    plt.savefig(resolved, dpi=150, bbox_inches="tight")
    plt.close()
    logger.info("Saved SHAP summary plot to %s", resolved)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_output_path(
    path: Optional[str | pathlib.Path], param_key: str
) -> pathlib.Path:
    if path is not None:
        return pathlib.Path(path)
    project_root = pathlib.Path(__file__).resolve().parents[2]
    return project_root / get_param(param_key)


def _resolve_figure_path(
    path: Optional[str | pathlib.Path], filename: str
) -> pathlib.Path:
    if path is not None:
        return pathlib.Path(path)
    project_root = pathlib.Path(__file__).resolve().parents[2]
    return project_root / get_param("paths.figures") / filename


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    project_root = pathlib.Path(__file__).resolve().parents[2]
    df = pd.read_parquet(project_root / get_param("paths.features_parquet"))

    from src.skills.temporal_split import get_splits
    from src.models.xgb import XGBForecaster

    train, val, test = get_splits(df)
    target = get_param("data.target_column")
    X_val = val.drop(columns=[target])

    model = XGBForecaster.load()

    shap_df = compute_shap_values(model, X_val)
    save_shap_values(shap_df)
    plot_shap_summary(shap_df, X_val)

    top = get_top_drivers(shap_df, shap_df.index[0])
    print("Top 3 SHAP drivers for first validation row:", top)
