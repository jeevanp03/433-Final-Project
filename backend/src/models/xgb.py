"""
src.models.xgb
==============
Direct multi-step XGBoost forecaster (primary model).

Strategy: train 24 independent ``XGBRegressor`` models, one per forecast
horizon h = 1 .. 24.  At prediction time, model_h receives the *current*
feature vector and outputs y_hat(t + h).

Hyperparameters are read from ``configs/params.yaml`` under
``model.xgboost``.  Early stopping is applied on the validation set
using MAE.

Trained models are saved as joblib files:
    ``models/xgb_h{h}.joblib``  for h = 1 .. 24

Usage::

    python -m src.models.xgb
"""

from __future__ import annotations

import logging
import pathlib
from typing import Optional

import joblib
import numpy as np
import pandas as pd
from xgboost import XGBRegressor

from src.models.base import Forecaster
from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger
from src.skills.metrics import compute_all

logger: logging.Logger = get_logger(__name__)


class XGBForecaster(Forecaster):
    """Direct multi-step XGBoost forecaster.

    Trains one ``XGBRegressor`` per horizon h = 1 .. ``horizons``.  Each
    model predicts ``y(t + h)`` given the feature vector at time ``t``.

    Parameters
    ----------
    horizons : int
        Number of forecast horizons.  Defaults to ``model.xgboost.horizons``
        from params.yaml.
    params : dict | None
        XGBoost hyper-parameters.  If ``None``, loaded from params.yaml.
    """

    def __init__(
        self,
        horizons: Optional[int] = None,
        params: Optional[dict] = None,
    ) -> None:
        cfg_horizons: int = get_param("model.xgboost.horizons")
        super().__init__(
            horizons=horizons if horizons is not None else cfg_horizons,
            random_state=get_param("model.xgboost.random_state"),
        )
        self._params: dict = params if params is not None else _load_xgb_params()
        self._models: list[Optional[XGBRegressor]] = [None] * self.horizons

    # ------------------------------------------------------------------
    # Forecaster interface
    # ------------------------------------------------------------------

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
    ) -> "XGBForecaster":
        """Fit 24 independent XGBoost models, one per horizon.

        Parameters
        ----------
        X_train : pd.DataFrame
            Training features (rows already shifted so no leakage).
        y_train : pd.Series
            Target values aligned with X_train.
        X_val : pd.DataFrame | None
            Validation features for early stopping.
        y_val : pd.Series | None
            Validation targets for early stopping.

        Returns
        -------
        XGBForecaster
        """
        target: str = get_param("data.target_column")
        early_stop: int = self._params.pop("early_stopping_rounds", 50)

        feature_cols = [c for c in X_train.columns if c != target]
        has_val = X_val is not None and y_val is not None

        for h in range(1, self.horizons + 1):
            logger.info("Training XGBoost for horizon h=%d …", h)

            y_h_train = y_train.shift(-h).dropna()
            X_h_train = X_train.loc[y_h_train.index, feature_cols]

            model_params = dict(self._params)
            fit_kwargs: dict = {}
            if has_val:
                y_h_val = y_val.shift(-h).dropna()
                X_h_val = X_val.loc[y_h_val.index, feature_cols]
                model_params["early_stopping_rounds"] = early_stop
                fit_kwargs["eval_set"] = [(X_h_val, y_h_val)]
                fit_kwargs["verbose"] = False

            model = XGBRegressor(**model_params)
            model.fit(X_h_train, y_h_train, **fit_kwargs)
            self._models[h - 1] = model

        self._is_fitted = True
        self._params["early_stopping_rounds"] = early_stop  # restore
        logger.info("XGBForecaster trained for all %d horizons.", self.horizons)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generate forecasts for all horizons.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix (one row per forecast origin).

        Returns
        -------
        np.ndarray
            Shape ``(len(X), self.horizons)``.
        """
        self._check_is_fitted()
        target: str = get_param("data.target_column")
        feature_cols = [c for c in X.columns if c != target]

        preds = np.column_stack(
            [m.predict(X[feature_cols]) for m in self._models if m is not None]
        )
        return preds

    def evaluate(
        self, X: pd.DataFrame, y_true: pd.Series
    ) -> dict[str, float]:
        """Evaluate the 1-step-ahead (h=1) forecast against ground truth.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix.
        y_true : pd.Series
            Ground-truth targets (aligned with X).

        Returns
        -------
        dict[str, float]
        """
        self._check_is_fitted()
        preds_2d = self.predict(X)
        y_pred_h1 = preds_2d[:, 0]  # h=1 column
        metrics = compute_all(y_true.values[: len(y_pred_h1)], y_pred_h1)
        logger.info("XGBForecaster h=1 evaluation: %s", metrics)
        return metrics

    # ------------------------------------------------------------------
    # Persistence
    # ------------------------------------------------------------------

    def save(self, directory: Optional[str | pathlib.Path] = None) -> pathlib.Path:
        """Save all horizon models as joblib files.

        Parameters
        ----------
        directory : str | Path | None
            Output directory.  Defaults to ``paths.models`` in params.yaml.

        Returns
        -------
        pathlib.Path
            The directory where files were saved.
        """
        self._check_is_fitted()
        out_dir = _resolve_model_dir(directory)
        out_dir.mkdir(parents=True, exist_ok=True)
        for h, model in enumerate(self._models, start=1):
            path = out_dir / f"xgb_h{h}.joblib"
            joblib.dump(model, path)
        logger.info("Saved %d XGBoost model files to %s", self.horizons, out_dir)
        return out_dir

    @classmethod
    def load(
        cls,
        directory: Optional[str | pathlib.Path] = None,
        horizons: int = 24,
    ) -> "XGBForecaster":
        """Load XGBoost models from joblib files.

        Parameters
        ----------
        directory : str | Path | None
            Directory containing ``xgb_h{h}.joblib`` files.
        horizons : int
            Number of horizons to load.

        Returns
        -------
        XGBForecaster
        """
        out_dir = _resolve_model_dir(directory)
        instance = cls(horizons=horizons)
        for h in range(1, horizons + 1):
            path = out_dir / f"xgb_h{h}.joblib"
            instance._models[h - 1] = joblib.load(path)
        instance._is_fitted = True
        logger.info("Loaded %d XGBoost models from %s", horizons, out_dir)
        return instance


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load_xgb_params() -> dict:
    """Return XGBoost hyperparameters from params.yaml as a flat dict."""
    xgb_cfg: dict = get_param("model.xgboost")
    exclude = {"horizons", "random_search"}
    params = {k: v for k, v in xgb_cfg.items() if k not in exclude}
    return params


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
    splits = get_splits(df)

    model = XGBForecaster()
    model.fit(
        splits["X_train"], splits["y_train"],
        X_val=splits["X_val"], y_val=splits["y_val"],
    )
    model.save()
    metrics = model.evaluate(splits["X_val"], splits["y_val"])
    print("XGBoost h=1 validation metrics:", metrics)
