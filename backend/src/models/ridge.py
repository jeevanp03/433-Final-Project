"""
src.models.ridge
================
Direct multi-step Ridge regression forecaster.

Strategy: train 24 independent ``Ridge`` models (one per horizon h=1..24).
Alpha is tuned via ``TimeSeriesSplit`` cross-validation on the training set
using the candidate values in ``configs/params.yaml`` under
``model.ridge.alpha_candidates``.

Trained models are saved as joblib files:
    ``models/ridge_h{h}.joblib``  for h = 1 .. 24

Usage::

    python -m src.models.ridge
"""

from __future__ import annotations

import logging
import pathlib
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from src.models.base import Forecaster
from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger
from src.skills.metrics import compute_all

logger: logging.Logger = get_logger(__name__)


class RidgeForecaster(Forecaster):
    """Direct multi-step Ridge regression forecaster.

    Each of the 24 independent Ridge models is wrapped in a
    ``Pipeline(StandardScaler → Ridge)`` so features are normalised
    before fitting.  Alpha is selected via ``TimeSeriesSplit`` CV.

    Parameters
    ----------
    horizons : int | None
        Number of forecast horizons.  Defaults to ``model.ridge.horizons``.
    """

    def __init__(self, horizons: Optional[int] = None) -> None:
        cfg = get_param("model.ridge")
        super().__init__(
            horizons=horizons if horizons is not None else cfg["horizons"],
            random_state=cfg["random_state"],
        )
        self._alpha_candidates: list[float] = cfg["alpha_candidates"]
        self._cv_splits: int = cfg["cv_splits"]
        self._pipelines: list[Optional[Pipeline]] = [None] * self.horizons

    # ------------------------------------------------------------------
    # Forecaster interface
    # ------------------------------------------------------------------

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
    ) -> "RidgeForecaster":
        """Fit 24 Ridge pipelines with cross-validated alpha selection.

        Parameters
        ----------
        X_train : pd.DataFrame
            Training feature matrix.
        y_train : pd.Series
            Training targets.
        X_val, y_val : ignored (Ridge uses CV on training set for tuning).

        Returns
        -------
        RidgeForecaster
        """
        target: str = get_param("data.target_column")
        feature_cols = [c for c in X_train.columns if c != target]
        tscv = TimeSeriesSplit(n_splits=self._cv_splits)

        for h in range(1, self.horizons + 1):
            logger.info("Training Ridge for horizon h=%d …", h)

            y_h = y_train.shift(-h).dropna()
            X_h = X_train.loc[y_h.index, feature_cols]

            pipeline = Pipeline([
                ("scaler", StandardScaler()),
                ("ridge", Ridge()),
            ])
            param_grid = {"ridge__alpha": self._alpha_candidates}
            gs = GridSearchCV(
                pipeline,
                param_grid,
                cv=tscv,
                scoring="neg_mean_absolute_error",
                n_jobs=-1,
            )
            gs.fit(X_h, y_h)
            self._pipelines[h - 1] = gs.best_estimator_
            logger.debug("h=%d best alpha=%.4f", h, gs.best_params_["ridge__alpha"])

        self._is_fitted = True
        logger.info("RidgeForecaster trained for all %d horizons.", self.horizons)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generate predictions for all horizons.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix.

        Returns
        -------
        np.ndarray
            Shape ``(len(X), self.horizons)``.
        """
        self._check_is_fitted()
        target: str = get_param("data.target_column")
        feature_cols = [c for c in X.columns if c != target]

        preds = np.column_stack(
            [p.predict(X[feature_cols]) for p in self._pipelines if p is not None]
        )
        return preds

    def evaluate(
        self, X: pd.DataFrame, y_true: pd.Series
    ) -> dict[str, float]:
        """Evaluate h=1 predictions against ground truth."""
        self._check_is_fitted()
        preds_2d = self.predict(X)
        y_pred_h1 = preds_2d[:, 0]
        metrics = compute_all(y_true.values[: len(y_pred_h1)], y_pred_h1)
        logger.info("RidgeForecaster h=1 evaluation: %s", metrics)
        return metrics

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, directory: Optional[str | pathlib.Path] = None) -> pathlib.Path:
        """Persist all horizon pipelines to disk."""
        self._check_is_fitted()
        out_dir = _resolve_model_dir(directory)
        out_dir.mkdir(parents=True, exist_ok=True)
        for h, pipeline in enumerate(self._pipelines, start=1):
            joblib.dump(pipeline, out_dir / f"ridge_h{h}.joblib")
        logger.info("Saved %d Ridge pipelines to %s", self.horizons, out_dir)
        return out_dir

    @classmethod
    def load(
        cls,
        directory: Optional[str | pathlib.Path] = None,
        horizons: int = 24,
    ) -> "RidgeForecaster":
        """Load Ridge pipelines from joblib files."""
        out_dir = _resolve_model_dir(directory)
        instance = cls(horizons=horizons)
        for h in range(1, horizons + 1):
            instance._pipelines[h - 1] = joblib.load(out_dir / f"ridge_h{h}.joblib")
        instance._is_fitted = True
        return instance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_model_dir(directory: Optional[str | pathlib.Path]) -> pathlib.Path:
    if directory is not None:
        return pathlib.Path(directory)
    project_root = pathlib.Path(__file__).resolve().parents[2]
    return project_root / get_param("paths.models")


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    load_config()
    project_root = pathlib.Path(__file__).resolve().parents[2]
    df = pd.read_parquet(project_root / get_param("paths.features_parquet"))

    from src.skills.temporal_split import get_splits
    train, val, test = get_splits(df)

    target = get_param("data.target_column")
    X_train, y_train = train.drop(columns=[target]), train[target]
    X_val, y_val = val.drop(columns=[target]), val[target]

    model = RidgeForecaster()
    model.fit(X_train, y_train)
    model.save()
    metrics = model.evaluate(X_val, y_val)
    print("Ridge h=1 validation metrics:", metrics)
