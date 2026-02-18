"""
src.models.evaluate
===================
Rolling-window backtesting harness, metric computation, and error slicing.

Two modes:
    1. **Overall evaluation** (``run_evaluation``): Train all 3 models from
       scratch and report aggregate metrics on validation and test sets.
    2. **Rolling backtest** (``run_rolling_backtest``): Load pre-trained models,
       predict at 600+ rolling origins every ``step`` hours across the
       validation set, then slice errors along 5 dimensions.

Output files (paths from params.yaml):
    results/validation_metrics.csv
    results/test_metrics.csv
    results/backtest_results.parquet
    results/error_slices.csv

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
from src.skills.temporal_split import backtest_origins, get_splits

logger: logging.Logger = get_logger(__name__)


# ---------------------------------------------------------------------------
# Public API — Overall evaluation
# ---------------------------------------------------------------------------

def run_evaluation(df: Optional[pd.DataFrame] = None) -> dict[str, pd.DataFrame]:
    """Run the full evaluation for all models (train from scratch).

    Returns
    -------
    dict[str, pd.DataFrame]
        Keys: 'validation', 'test'.
    """
    if df is None:
        df = _load_features()

    train, val, test = get_splits(df)
    target = get_param("data.target_column")
    X_train, y_train = train.drop(columns=[target]), train[target]
    X_val, y_val = val.drop(columns=[target]), val[target]
    X_test, y_test = test.drop(columns=[target]), test[target]

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

        val_metrics = _compute_metrics(model, X_val, y_val)
        val_records.append({"model": name, **val_metrics})

        test_metrics = _compute_metrics(model, X_test, y_test)
        test_records.append({"model": name, **test_metrics})

    val_df = pd.DataFrame(val_records).set_index("model")
    test_df = pd.DataFrame(test_records).set_index("model")

    _save_metrics(val_df, "paths.validation_metrics")
    _save_metrics(test_df, "paths.test_metrics")

    return {"validation": val_df, "test": test_df}


# ---------------------------------------------------------------------------
# Public API — Rolling backtest with error slicing
# ---------------------------------------------------------------------------

def run_rolling_backtest(
    df: Optional[pd.DataFrame] = None,
    step: int = 21,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Run rolling-window backtest with 600+ origins and compute error slices.

    At each origin, the pre-trained models predict 24 hours ahead.
    Predictions are compared against actuals and errors are sliced along
    5 dimensions: hour_of_day, day_of_week, month, forecast_horizon,
    and demand_tercile.

    Parameters
    ----------
    df : pd.DataFrame | None
        Feature matrix. Loaded from params.yaml if None.
    step : int
        Hours between successive forecast origins. 21 gives ~625 origins
        over the 18-month validation window.

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame]
        (backtest_results, error_slices)
    """
    if df is None:
        df = _load_features()

    target = get_param("data.target_column")
    train, val, test = get_splits(df)

    # Load pre-trained models (no retraining)
    from src.models.baseline import SeasonalNaive
    from src.models.ridge import RidgeForecaster
    from src.models.xgb import XGBForecaster

    X_train, y_train = train.drop(columns=[target]), train[target]
    naive = SeasonalNaive()
    naive.fit(X_train, y_train)

    ridge = RidgeForecaster.load()
    xgb = XGBForecaster.load()

    models = {
        "seasonal_naive": naive,
        "ridge": ridge,
        "xgboost": xgb,
    }

    # Get rolling origins
    origins = backtest_origins(df.index, step=step)
    logger.info("Rolling backtest: %d origins (step=%d hours)", len(origins), step)

    feature_cols = [c for c in df.columns if c != target]

    # Filter origins that have at least 24 future hours in the dataset
    origin_locs = [df.index.get_loc(o) for o in origins]
    valid_mask = [loc + 24 < len(df) for loc in origin_locs]
    origins = [o for o, v in zip(origins, valid_mask) if v]
    origin_locs = [l for l, v in zip(origin_locs, valid_mask) if v]
    logger.info("Valid origins (24h lookahead): %d", len(origins))

    # Vectorized: predict at all origins at once per model
    X_origins = df.loc[origins, feature_cols]

    all_frames: list[pd.DataFrame] = []
    for model_name, model in models.items():
        logger.info("Backtest predictions for: %s", model_name)
        preds_2d = model.predict(X_origins)  # shape (n_origins, 24) or (n_origins,)

        is_1d = preds_2d.ndim == 1
        if is_1d:
            # SeasonalNaive: only h=1, expand to (n, 1)
            preds_2d = preds_2d.reshape(-1, 1)

        n_horizons = preds_2d.shape[1]

        for h_idx in range(n_horizons):
            h = h_idx + 1
            preds_h = preds_2d[:, h_idx]

            # Get actuals at origin + h for each origin
            target_indices = [loc + h for loc in origin_locs]
            actuals_h = df[target].iloc[target_indices].values
            target_times = df.index[target_indices]

            frame = pd.DataFrame({
                "origin": origins,
                "target_time": target_times,
                "horizon": h,
                "model": model_name,
                "actual": actuals_h,
                "predicted": preds_h,
                "error": actuals_h - preds_h,
                "abs_error": np.abs(actuals_h - preds_h),
                "hour_of_day": target_times.hour,
                "day_of_week": target_times.dayofweek,
                "month": target_times.month,
            })
            all_frames.append(frame)

    backtest_df = pd.concat(all_frames, ignore_index=True)

    # Add demand tercile based on actual values
    tercile_bins = backtest_df["actual"].quantile([0, 1/3, 2/3, 1.0]).values
    tercile_bins[0] = -np.inf
    tercile_bins[-1] = np.inf
    backtest_df["demand_tercile"] = pd.cut(
        backtest_df["actual"],
        bins=tercile_bins,
        labels=["low", "medium", "high"],
    )

    logger.info(
        "Backtest complete: %d prediction records from %d origins",
        len(backtest_df), len(origins),
    )

    # Save backtest results
    project_root = pathlib.Path(__file__).resolve().parents[2]
    bt_path = project_root / get_param("paths.backtest_results")
    bt_path.parent.mkdir(parents=True, exist_ok=True)
    backtest_df.to_parquet(bt_path, index=False)
    logger.info("Saved backtest results to %s", bt_path)

    # Compute error slices
    error_slices = _compute_error_slices(backtest_df)

    slice_path = project_root / get_param("paths.error_slices")
    error_slices.to_csv(slice_path)
    logger.info("Saved error slices to %s", slice_path)

    return backtest_df, error_slices


def _compute_error_slices(backtest_df: pd.DataFrame) -> pd.DataFrame:
    """Slice backtest errors along 5 dimensions.

    Dimensions:
        1. hour_of_day (0-23)
        2. day_of_week (0=Mon, 6=Sun)
        3. month (1-12)
        4. forecast_horizon (1-24)
        5. demand_tercile (low/medium/high)
    """
    slice_dims = {
        "hour_of_day": "hour_of_day",
        "day_of_week": "day_of_week",
        "month": "month",
        "forecast_horizon": "horizon",
        "demand_tercile": "demand_tercile",
    }

    all_slices: list[dict] = []

    for model_name in backtest_df["model"].unique():
        model_df = backtest_df[backtest_df["model"] == model_name]

        # Overall metrics for this model
        metrics = compute_all(model_df["actual"].values, model_df["predicted"].values)
        all_slices.append({
            "model": model_name,
            "dimension": "overall",
            "slice_value": "all",
            **metrics,
            "n_samples": len(model_df),
        })

        # Per-dimension slices
        for dim_name, col_name in slice_dims.items():
            for val, group in model_df.groupby(col_name, observed=True):
                if len(group) < 5:
                    continue
                metrics = compute_all(group["actual"].values, group["predicted"].values)
                all_slices.append({
                    "model": model_name,
                    "dimension": dim_name,
                    "slice_value": str(val),
                    **metrics,
                    "n_samples": len(group),
                })

    return pd.DataFrame(all_slices)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _compute_metrics(model, X: pd.DataFrame, y_true: pd.Series) -> dict[str, float]:
    """Compute all configured evaluation metrics for a model on a dataset."""
    y_pred_2d = model.predict(X)
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

    # 1. Overall evaluation (retrains models)
    results = run_evaluation()
    print("Validation metrics:")
    print(results["validation"])
    print("\nTest metrics:")
    print(results["test"])

    # 2. Rolling backtest with error slicing (uses pre-trained models)
    print("\n" + "=" * 70)
    print("Running rolling backtest with error slicing …")
    print("=" * 70)
    backtest_df, error_slices = run_rolling_backtest()

    # Summary stats
    n_origins = backtest_df["origin"].nunique()
    print(f"\nBacktest origins: {n_origins}")
    print(f"Total prediction records: {len(backtest_df)}")

    # Print overall backtest metrics per model
    overall = error_slices[error_slices["dimension"] == "overall"]
    print("\nOverall backtest metrics (rolling validation):")
    print(overall[["model", "mae", "rmse", "mape", "n_samples"]].to_string(index=False))

    # Print sample slices
    print("\nError by forecast horizon (XGBoost, h=1,6,12,18,24):")
    xgb_horizon = error_slices[
        (error_slices["model"] == "xgboost")
        & (error_slices["dimension"] == "forecast_horizon")
    ]
    sample_h = xgb_horizon[xgb_horizon["slice_value"].isin(["1", "6", "12", "18", "24"])]
    print(sample_h[["slice_value", "mae", "rmse", "n_samples"]].to_string(index=False))

    print("\nError by demand tercile (XGBoost):")
    xgb_tercile = error_slices[
        (error_slices["model"] == "xgboost")
        & (error_slices["dimension"] == "demand_tercile")
    ]
    print(xgb_tercile[["slice_value", "mae", "rmse", "n_samples"]].to_string(index=False))
