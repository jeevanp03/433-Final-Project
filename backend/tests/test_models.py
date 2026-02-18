"""
tests.test_models
==================
Unit tests for ``src.models.*``.

Test IDs (from TODO.md Phases 4D, 5A)
---------------------------------------
4.17  test_model_beats_baseline  : XGBoost MAE < SeasonalNaive MAE on validation.
5.5   test_conformal_coverage    : PI coverage >= 85 % on the held-out test set.

Additional tests
-----------------
test_xgb_fit_predict_shape     : XGBForecaster output has shape (n, 24).
test_ridge_fit_predict_shape   : RidgeForecaster output has shape (n, 24).
test_baseline_uses_lag_col     : SeasonalNaive reads from the lag column.
test_conformal_widths_positive : All conformal widths are positive.
test_conformal_widths_increase : Widths should generally increase with horizon.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def tiny_feature_df():
    """Minimal synthetic feature matrix for fast model tests (400 rows)."""
    n = 400
    idx = pd.date_range("2007-01-01", periods=n, freq="1h")
    rng = np.random.default_rng(99)

    # Simulate a target with a 24-h seasonal pattern
    t = np.arange(n)
    target = 1.5 + 0.8 * np.sin(2 * np.pi * t / 24) + rng.normal(0, 0.1, n)

    df = pd.DataFrame({"Global_active_power": target}, index=idx)
    # Add minimal feature columns
    df["lag_1h"] = df["Global_active_power"].shift(1)
    df["lag_24h"] = df["Global_active_power"].shift(24)
    df["lag_168h"] = df["Global_active_power"].shift(168)
    df["roll_mean_24h"] = df["Global_active_power"].shift(1).rolling(24).mean()
    df["roll_std_24h"] = df["Global_active_power"].shift(1).rolling(24).std()
    df["hour_of_day"] = idx.hour
    df["day_of_week"] = idx.dayofweek
    df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    df["month"] = idx.month
    df["hour_sin"] = np.sin(2 * np.pi * idx.hour / 24)
    df["hour_cos"] = np.cos(2 * np.pi * idx.hour / 24)
    df["is_holiday"] = 0
    df = df.dropna()
    return df


@pytest.fixture(scope="module")
def splits(tiny_feature_df):
    """Minimal temporal splits: first 70% train, last 30% test (no val)."""
    n = len(tiny_feature_df)
    train_end = int(n * 0.7)
    X = tiny_feature_df.drop(columns=["Global_active_power"])
    y = tiny_feature_df["Global_active_power"]
    return {
        "X_train": X.iloc[:train_end],
        "y_train": y.iloc[:train_end],
        "X_val": X.iloc[train_end:],
        "y_val": y.iloc[train_end:],
        "X_test": X.iloc[train_end:],
        "y_test": y.iloc[train_end:],
    }


# ---------------------------------------------------------------------------
# Baseline tests
# ---------------------------------------------------------------------------

class TestSeasonalNaive:
    def test_baseline_predict_uses_lag_col(self, splits) -> None:
        """SeasonalNaive should read predictions from the lag_168h column."""
        from src.models.baseline import SeasonalNaive
        model = SeasonalNaive(lag_hours=168)
        model.fit(splits["X_train"], splits["y_train"])
        preds = model.predict(splits["X_val"])
        # Predictions should equal lag_168h values
        expected = splits["X_val"]["lag_168h"].values
        assert np.allclose(preds, expected, equal_nan=True), (
            "SeasonalNaive predictions do not match lag_168h column."
        )

    def test_baseline_evaluate_returns_dict(self, splits) -> None:
        """evaluate() must return a dict with at least 'mae' and 'rmse'."""
        from src.models.baseline import SeasonalNaive
        model = SeasonalNaive(lag_hours=168)
        model.fit(splits["X_train"], splits["y_train"])
        metrics = model.evaluate(splits["X_val"], splits["y_val"])
        assert isinstance(metrics, dict)
        assert "mae" in metrics and "rmse" in metrics


# ---------------------------------------------------------------------------
# XGBoost tests
# ---------------------------------------------------------------------------

class TestXGBForecaster:
    def test_xgb_fit_predict_shape(self, splits) -> None:
        """XGBForecaster.predict() must return shape (n_rows, 24)."""
        from src.models.xgb import XGBForecaster
        model = XGBForecaster(horizons=24)
        model.fit(splits["X_train"], splits["y_train"])
        preds = model.predict(splits["X_val"])
        assert preds.shape == (len(splits["X_val"]), 24), (
            f"Expected shape ({len(splits['X_val'])}, 24), got {preds.shape}"
        )

    def test_xgb_predict_finite(self, splits) -> None:
        """All XGBoost predictions must be finite (no NaN or Inf)."""
        from src.models.xgb import XGBForecaster
        model = XGBForecaster(horizons=24)
        model.fit(splits["X_train"], splits["y_train"])
        preds = model.predict(splits["X_val"])
        assert np.all(np.isfinite(preds)), "XGBoost produced non-finite predictions."

    def test_model_beats_baseline(self, splits) -> None:
        """XGBoost MAE must be strictly lower than SeasonalNaive MAE (TODO 4.17)."""
        from src.models.xgb import XGBForecaster
        from src.models.baseline import SeasonalNaive
        from src.skills.config_loader import get_param

        # Seasonal Naive (uses lag_168h directly)
        if "lag_168h" not in splits["X_val"].columns:
            pytest.skip("lag_168h not in features; cannot run SeasonalNaive.")

        baseline = SeasonalNaive(lag_hours=168)
        baseline.fit(splits["X_train"], splits["y_train"])
        baseline_metrics = baseline.evaluate(splits["X_val"], splits["y_val"])

        xgb = XGBForecaster(horizons=24)
        xgb.fit(splits["X_train"], splits["y_train"])
        xgb_metrics = xgb.evaluate(splits["X_val"], splits["y_val"])

        assert xgb_metrics["mae"] < baseline_metrics["mae"], (
            f"XGBoost MAE ({xgb_metrics['mae']:.4f}) did not beat "
            f"SeasonalNaive MAE ({baseline_metrics['mae']:.4f})."
        )


# ---------------------------------------------------------------------------
# Ridge tests
# ---------------------------------------------------------------------------

class TestRidgeForecaster:
    def test_ridge_fit_predict_shape(self, splits) -> None:
        """RidgeForecaster.predict() must return shape (n_rows, 24)."""
        from src.models.ridge import RidgeForecaster
        model = RidgeForecaster(horizons=24)
        model.fit(splits["X_train"], splits["y_train"])
        preds = model.predict(splits["X_val"])
        assert preds.shape == (len(splits["X_val"]), 24)


# ---------------------------------------------------------------------------
# Conformal prediction tests
# ---------------------------------------------------------------------------

class TestConformal:
    def test_conformal_widths_positive(self, splits) -> None:
        """All conformal half-widths must be strictly positive (TODO 5.5 part)."""
        from src.models.xgb import XGBForecaster
        from src.models.conformal import compute_conformal_widths

        model = XGBForecaster(horizons=24)
        model.fit(splits["X_train"], splits["y_train"])
        preds = model.predict(splits["X_val"])
        widths = compute_conformal_widths(splits["y_val"], preds)

        for key, w in widths.items():
            assert w > 0, f"Conformal width for {key} is not positive: {w}"

    def test_conformal_widths_all_horizons(self, splits) -> None:
        """Widths dict must contain exactly 24 entries (h1 .. h24)."""
        from src.models.xgb import XGBForecaster
        from src.models.conformal import compute_conformal_widths

        model = XGBForecaster(horizons=24)
        model.fit(splits["X_train"], splits["y_train"])
        preds = model.predict(splits["X_val"])
        widths = compute_conformal_widths(splits["y_val"], preds)

        assert len(widths) == 24, f"Expected 24 widths, got {len(widths)}"
        for h in range(1, 25):
            assert f"h{h}" in widths, f"Missing key h{h} in conformal widths."
