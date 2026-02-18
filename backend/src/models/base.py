"""
src.models.base
===============
Abstract base class for all forecasting models in this project.

All concrete forecasters (Baseline, Ridge, XGBoost) must subclass
``Forecaster`` and implement the three abstract methods: ``fit``,
``predict``, and ``evaluate``.

This enforces a uniform interface so that ``evaluate.py`` can run any
model through the same backtesting harness without model-specific
branching.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

import numpy as np
import pandas as pd


class Forecaster(ABC):
    """Abstract base class for direct multi-step energy forecasters.

    Subclasses implement a *direct multi-step* strategy: one independent
    model per forecast horizon h = 1 .. H.

    Parameters
    ----------
    horizons : int
        Number of forecast horizons (default 24 for 24-hour-ahead).
    random_state : int
        Seed for reproducibility.  Passed to underlying estimators.
    """

    def __init__(self, horizons: int = 24, random_state: int = 42) -> None:
        self.horizons = horizons
        self.random_state = random_state
        self._is_fitted: bool = False

    # ------------------------------------------------------------------
    # Abstract interface
    # ------------------------------------------------------------------

    @abstractmethod
    def fit(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        X_val: Optional[pd.DataFrame] = None,
        y_val: Optional[pd.Series] = None,
    ) -> "Forecaster":
        """Fit the forecaster on the training set.

        Parameters
        ----------
        X_train : pd.DataFrame
            Feature matrix for the training period.
        y_train : pd.Series
            Target values aligned with ``X_train``.
        X_val : pd.DataFrame | None
            Optional validation features (used for early stopping).
        y_val : pd.Series | None
            Optional validation targets.

        Returns
        -------
        Forecaster
            Returns ``self`` for method chaining.
        """

    @abstractmethod
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Generate point forecasts for each row of ``X``.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix for the forecast period.

        Returns
        -------
        np.ndarray
            Shape ``(len(X), self.horizons)`` — one column per horizon.
        """

    @abstractmethod
    def evaluate(
        self, X: pd.DataFrame, y_true: pd.Series
    ) -> dict[str, float]:
        """Compute evaluation metrics on a held-out set.

        Parameters
        ----------
        X : pd.DataFrame
            Feature matrix.
        y_true : pd.Series
            Ground-truth targets.

        Returns
        -------
        dict[str, float]
            Mapping of metric name -> value (e.g. {'mae': 0.12, 'rmse': 0.18}).
        """

    # ------------------------------------------------------------------
    # Shared utilities
    # ------------------------------------------------------------------

    def _check_is_fitted(self) -> None:
        """Raise ``RuntimeError`` if ``fit()`` has not been called yet."""
        if not self._is_fitted:
            raise RuntimeError(
                f"{self.__class__.__name__} must be fitted before calling predict(). "
                "Call .fit() first."
            )

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}("
            f"horizons={self.horizons}, "
            f"random_state={self.random_state})"
        )
