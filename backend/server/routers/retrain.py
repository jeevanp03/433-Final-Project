"""Retrain router — background model retraining after dataset upload."""

from __future__ import annotations

from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter

from server.schemas import RetrainStatusResponse
from src.skills.config_loader import get_param

router = APIRouter(tags=["retrain"])

# ---------------------------------------------------------------------------
# In-memory status (single-worker safe; no DB needed)
# ---------------------------------------------------------------------------

_retrain_status: dict = {
    "running": False,
    "step": "",
    "progress": 0,
    "error": None,
    "started_at": None,
    "finished_at": None,
}


def get_retrain_status() -> dict:
    return dict(_retrain_status)


# ---------------------------------------------------------------------------
# GET /api/retrain/status
# ---------------------------------------------------------------------------

@router.get("/retrain/status", response_model=RetrainStatusResponse)
def retrain_status():
    """Return current retraining pipeline status."""
    return RetrainStatusResponse(**_retrain_status)


# ---------------------------------------------------------------------------
# Background retraining pipeline
# ---------------------------------------------------------------------------

def _update(step: str, progress: int) -> None:
    _retrain_status["step"] = step
    _retrain_status["progress"] = progress


def run_retrain_pipeline(hourly_df: pd.DataFrame) -> None:
    """Run the full retrain pipeline in a background task.

    Steps: features → splits → xgboost → ridge → conformal → shap → clear caches.
    """
    if _retrain_status["running"]:
        return  # don't stack concurrent retrains

    _retrain_status["running"] = True
    _retrain_status["error"] = None
    _retrain_status["started_at"] = datetime.now(timezone.utc).isoformat()
    _retrain_status["finished_at"] = None

    try:
        # 1. Feature engineering (0-20%)
        _update("features", 0)
        from src.features.engineer import build_features, save_features

        features_df = build_features(hourly_df)
        save_features(features_df)
        _update("features", 20)

        # 2. Compute proportional splits (20%)
        _update("splits", 20)
        from src.skills.temporal_split import get_splits

        idx = features_df.index
        start = idx.min()
        end = idx.max()
        total_duration = end - start

        train_end = (start + total_duration * 0.60).strftime("%Y-%m-%d")
        val_end = (start + total_duration * 0.85).strftime("%Y-%m-%d")

        train, val, _test = get_splits(features_df, train_end=train_end, val_end=val_end)

        target_col = get_param("data.target_column", "Global_active_power")
        X_train = train.drop(columns=[target_col])
        y_train = train[target_col]
        X_val = val.drop(columns=[target_col])
        y_val = val[target_col]

        # 3. XGBoost (20-50%)
        _update("xgboost", 25)
        from src.models.xgb import XGBForecaster

        xgb_model = XGBForecaster()
        xgb_model.fit(X_train, y_train, X_val, y_val)
        xgb_model.save()
        _update("xgboost", 50)

        # 4. Ridge (50-70%)
        _update("ridge", 50)
        from src.models.ridge import RidgeForecaster

        ridge_model = RidgeForecaster()
        ridge_model.fit(X_train, y_train, X_val, y_val)
        ridge_model.save()
        _update("ridge", 70)

        # 5. Conformal prediction intervals (70-85%)
        _update("conformal", 70)
        from src.models.conformal import compute_conformal_widths, save_conformal_widths
        import numpy as np

        y_pred_val = xgb_model.predict(X_val)
        if isinstance(y_pred_val, pd.DataFrame):
            y_pred_val = y_pred_val.values
        if isinstance(y_pred_val, np.ndarray) and y_pred_val.ndim == 2:
            y_pred_val = y_pred_val[:, 0]

        widths = compute_conformal_widths(y_val, y_pred_val)
        save_conformal_widths(widths)
        _update("conformal", 85)

        # 6. SHAP values (85-95%)
        _update("shap", 85)
        from src.models.explain import compute_shap_values, save_shap_values

        shap_df = compute_shap_values(xgb_model, X_val)
        save_shap_values(shap_df)
        _update("shap", 95)

        # 7. Clear all server LRU caches (95-100%)
        _update("clearing_caches", 95)
        from server.deps import (
            get_hourly_data,
            get_features,
            get_backtest_results,
            get_shap_values,
            get_validation_metrics,
            get_test_metrics,
            get_conformal_widths,
            get_xgb_model,
            get_ridge_model,
        )

        for fn in [
            get_hourly_data,
            get_features,
            get_backtest_results,
            get_shap_values,
            get_validation_metrics,
            get_test_metrics,
            get_conformal_widths,
            get_xgb_model,
            get_ridge_model,
        ]:
            fn.cache_clear()

        _update("done", 100)
        _retrain_status["finished_at"] = datetime.now(timezone.utc).isoformat()

    except Exception as exc:
        _retrain_status["error"] = str(exc)
        _retrain_status["step"] = "error"
        _retrain_status["finished_at"] = datetime.now(timezone.utc).isoformat()

    finally:
        _retrain_status["running"] = False
