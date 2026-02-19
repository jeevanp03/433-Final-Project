"""Upload router — accepts CSV dataset uploads and replaces the active dataset."""

from __future__ import annotations

import io
from pathlib import Path

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile

from server.schemas import UploadResponse
from src.ingestion.clean import clean_and_resample, save_parquet
from src.skills.config_loader import get_param

router = APIRouter(tags=["upload"])

REQUIRED_COLUMNS = [
    "Global_active_power",
    "Global_reactive_power",
    "Voltage",
    "Global_intensity",
    "Sub_metering_1",
    "Sub_metering_2",
    "Sub_metering_3",
]


@router.post("/upload", response_model=UploadResponse)
async def upload_dataset(file: UploadFile, background_tasks: BackgroundTasks):
    """Upload a semicolon-delimited CSV to replace the active dataset.

    The file is parsed, validated, cleaned (hourly resampling + gap filling),
    and saved to ``data/processed/hourly_clean.parquet``.  Server-side LRU
    caches are cleared so subsequent API calls use the new data.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    # Read the uploaded bytes
    contents = await file.read()
    warnings: list[str] = []

    # --- Parse CSV --------------------------------------------------------
    try:
        raw_df = pd.read_csv(
            io.BytesIO(contents),
            sep=";",
            na_values="?",
            parse_dates={"datetime": ["Date", "Time"]},
            dayfirst=True,
            low_memory=False,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Failed to parse CSV: {exc}",
        )

    rows_raw = len(raw_df)

    # --- Validate columns -------------------------------------------------
    missing_cols = [c for c in REQUIRED_COLUMNS if c not in raw_df.columns]
    if missing_cols:
        raise HTTPException(
            status_code=422,
            detail=f"Missing required columns: {missing_cols}",
        )

    # Set datetime index
    if "datetime" in raw_df.columns:
        raw_df = raw_df.set_index("datetime").sort_index()
    elif raw_df.index.name != "datetime":
        raise HTTPException(
            status_code=422,
            detail="Could not parse Date/Time columns into a datetime index.",
        )

    # Ensure numeric types
    for col in REQUIRED_COLUMNS:
        raw_df[col] = pd.to_numeric(raw_df[col], errors="coerce")

    null_pct = raw_df[REQUIRED_COLUMNS].isnull().mean().max() * 100
    if null_pct > 50:
        warnings.append(
            f"High missing-data rate ({null_pct:.1f}% in worst column). "
            "Results may be unreliable."
        )

    # --- Clean & resample -------------------------------------------------
    try:
        clean_df = clean_and_resample(raw_df)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Cleaning failed: {exc}",
        )

    rows_clean = len(clean_df)
    if rows_clean < 168:
        raise HTTPException(
            status_code=422,
            detail=f"Only {rows_clean} clean hourly rows — need at least 168 (1 week).",
        )

    # --- Save to parquet --------------------------------------------------
    backend_root = Path(__file__).resolve().parents[2]
    out_path = backend_root / get_param("paths.hourly_parquet")
    save_parquet(clean_df, out_path)

    # --- Clear server LRU caches ------------------------------------------
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

    # --- Trigger background retrain ---------------------------------------
    from server.routers.retrain import run_retrain_pipeline

    background_tasks.add_task(run_retrain_pipeline, clean_df)

    # --- Build response ---------------------------------------------------
    date_range = {
        "from": str(clean_df.index.min()),
        "to": str(clean_df.index.max()),
    }

    return UploadResponse(
        filename=file.filename,
        rows_raw=rows_raw,
        rows_clean=rows_clean,
        date_range=date_range,
        columns=list(clean_df.columns),
        warnings=warnings,
    )
