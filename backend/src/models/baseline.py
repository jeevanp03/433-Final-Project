"""
src.models.baseline
===================
Seasonal-naive benchmark forecaster.

Strategy: y_hat(t + h) = y(t - 168 + h)  for h = 1 .. 24.
That is, the forecast for any future hour equals the actual value
from the same hour one week (168 hours) ago.  No training is required.

This sets the performance floor that Ridge and XGBoost must beat by
at least 15 % on validation MAE (acceptance criterion in test_models.py).

Usage::

    python -m src.models.baseline
"""

from __future__ import annotations

from typing import Optional

import numpy as np
import pandas as pd

from src.models.base import Forecaster
from src.skills.config_loader import get_param, load_config
from src.skills.logger import get_logger
from src.skills.metrics import compute_all

logger = get_logger(__name__)


class SeasonalNaive(Forecaster):
    """Seasonal-naive forecaster.

    Predicts by repeating the value from ``lag_hours`` steps in the past.
    ``lag_hours`` defaults to 168 (one week) as configured in params.yaml.

    Parameters
    ----------
    lag_hours : int | None
        Lag to use.  If ``None``, reads ``model.baseline.lag_hours`` from
        ``configs/params.yaml``.
    """

    def __init__(
        self,
        lag_hours: Optional[int] = None,
        horizons: int = 24,
        random_state: int = 42,
    ) -> None:
        super().__init__(horizons=horizons, random_state=random_state)
        self.lag_hours: int = lag_hours if lag_hours is not None else get_param(
            "model.baseline.lag_hours"
        )
        self._target_series: Optional[pd.Series] = None

    # ------------------------------------------------------------------
    # Forecaster interface
    # ------------------------------------------------------------------

    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
    ) -> "SeasonalNaive":
        """Store the training target series for look-up during prediction.

        The seasonal naive model needs access to historical actuals to look
        back ``lag_hours`` steps, so the full training series is cached.

        Parameters
        ----------
        X_train : pd.DataFrame
            Not used directly; kept for interface compatibility.
        y_train : pd.Series
            Actual target values with a DatetimeIndex.
        X_val, y_val : ignored.

        Returns
        -------
        SeasonalNaive
        """
        self._target_series = y_train.copy()
        self._is_fitted = True
        logger.info("SeasonalNaive fitted on %d training rows.", len(y_train))
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Return the value from ``lag_hours`` steps before each row.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix; must have a DatetimeIndex that aligns with the
            training series so look-back positions can be computed.

        Returns
        -------
        np.ndarray
            Shape ``(len(X),)`` — one prediction per row (h=1 ahead only,
            for the seasonal naive case).
        """
        self._check_is_fitted()
        target: str = get_param("data.target_column")

        # Use the lag_{lag_hours}h column if available, else look up in series
        lag_col = f"lag_{self.lag_hours}h"
        if lag_col in X.columns:
            return X[lag_col].values
        else:
            raise KeyError(
                f"Column '{lag_col}' not found in X.  "
                "Ensure the feature matrix was built with the matching lag."
            )

    def evaluate(
        self, X: pd.DataFrame, y_true: pd.Series
    ) -> dict[str, float]:
        """Compute standard metrics on a held-out set.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix (must contain the lag column).
        y_true : pd.Series
            Ground-truth target values.

        Returns
        -------
        dict[str, float]
        """
        self._check_is_fitted()
        y_pred = self.predict(X)
        metrics = compute_all(y_true.values, y_pred)
        logger.info("SeasonalNaive evaluation: %s", metrics)
        return metrics


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import pathlib
    load_config()

    project_root = pathlib.Path(__file__).resolve().parents[2]
    features_path = project_root / get_param("paths.features_parquet")
    df = pd.read_parquet(features_path)

    from src.skills.temporal_split import get_splits
    splits = get_splits(df)

    target: str = get_param("data.target_column")
    model = SeasonalNaive()
    model.fit(splits["X_train"], splits["y_train"])
    metrics = model.evaluate(splits["X_val"], splits["y_val"])
    print("Seasonal Naive validation metrics:", metrics)
