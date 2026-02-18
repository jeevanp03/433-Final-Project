# =============================================================================
# Makefile – Household Energy Dashboard (MSE 433)
#
# Usage:
#   make install     Install Python dependencies into the active venv
#   make ingest      Load raw CSV (step 1 of pipeline)
#   make clean-data  Clean raw data to hourly Parquet (step 2)
#   make features    Build feature matrix Parquet (step 3)
#   make train       Train XGBoost + Ridge models (step 4)
#   make evaluate    Run backtesting and save metrics (step 5)
#   make dashboard   Launch the Streamlit dashboard
#   make test        Run the full pytest test suite
#   make all         Full pipeline: clean-data → features → train → evaluate → test
#   make help        Print this help message
#
# All python -m invocations run from backend/ so relative imports
# resolve correctly.  Activate your venv before running make targets.
# =============================================================================

.PHONY: install ingest clean-data features train evaluate dashboard test all help

# Default target
.DEFAULT_GOAL := help

# Python interpreter — use venv if it exists, else fall back to system python
VENV := $(CURDIR)/.venv/bin/python
PYTHON := $(if $(wildcard $(VENV)),$(VENV),python)

# Config file (referenced for documentation purposes; src reads it directly)
CONFIG := configs/params.yaml


# -----------------------------------------------------------------------------
# help: Print available targets
# -----------------------------------------------------------------------------
help:
	@echo ""
	@echo "Household Energy Dashboard – available make targets:"
	@echo ""
	@echo "  install      Install Python dependencies (pip install -r requirements.txt)"
	@echo "  ingest       Load raw UCI CSV into a pandas DataFrame (load.py)"
	@echo "  clean-data   Resample to hourly, fill gaps, save Parquet (clean.py)"
	@echo "  features     Build feature matrix from clean Parquet (engineer.py)"
	@echo "  train        Train XGBoost + Ridge models (xgb.py, ridge.py)"
	@echo "  evaluate     Backtesting evaluation and save metrics CSV (evaluate.py)"
	@echo "  dashboard    Launch the Streamlit dashboard on port 8501"
	@echo "  test         Run pytest test suite with coverage report"
	@echo "  all          Full pipeline: clean-data → features → train → evaluate → test"
	@echo "  help         Show this help message"
	@echo ""


# -----------------------------------------------------------------------------
# install: Install all Python dependencies
# -----------------------------------------------------------------------------
install:
	@echo "--- Installing dependencies ---"
	$(PYTHON) -m pip install --upgrade pip
	$(PYTHON) -m pip install -r requirements.txt


# -----------------------------------------------------------------------------
# ingest: Load raw UCI CSV (produces in-memory DataFrame; logs stats to stdout)
# Prerequisite: data/raw/household_power_consumption.txt must exist.
# Download via: python -c "from ucimlrepo import fetch_ucirepo; ..."
# or manually from https://archive.ics.uci.edu/dataset/235
# -----------------------------------------------------------------------------
ingest:
	@echo "--- Step 1: Loading raw CSV ---"
	$(PYTHON) -m src.ingestion.load


# -----------------------------------------------------------------------------
# clean-data: Resample, gap-fill, save hourly_clean.parquet + quality_report.json
# Depends on: data/raw/household_power_consumption.txt
# Produces:   data/processed/hourly_clean.parquet
#             data/processed/quality_report.json
# -----------------------------------------------------------------------------
clean-data:
	@echo "--- Step 2: Cleaning and resampling to hourly Parquet ---"
	$(PYTHON) -m src.ingestion.clean


# -----------------------------------------------------------------------------
# features: Build full feature matrix, save features.parquet
# Depends on: data/processed/hourly_clean.parquet
# Produces:   data/features/features.parquet
# -----------------------------------------------------------------------------
features: clean-data
	@echo "--- Step 3: Engineering features ---"
	$(PYTHON) -m src.features.engineer


# -----------------------------------------------------------------------------
# train: Train XGBoost (primary) and Ridge models
# Depends on: data/features/features.parquet
# Produces:   models/xgb_h{1..24}.joblib
#             models/ridge_h{1..24}.joblib
#             models/conformal_widths.json
# -----------------------------------------------------------------------------
train: features
	@echo "--- Step 4a: Training XGBoost models ---"
	$(PYTHON) -m src.models.xgb
	@echo "--- Step 4b: Training Ridge regression models ---"
	$(PYTHON) -m src.models.ridge
	@echo "--- Step 4c: Fitting conformal prediction widths ---"
	$(PYTHON) -m src.models.conformal


# -----------------------------------------------------------------------------
# evaluate: Run backtesting harness, compute and save metrics CSVs + SHAP values
# Depends on: trained model artefacts in models/
# Produces:   results/validation_metrics.csv
#             results/test_metrics.csv
#             results/shap_values.parquet
#             results/figures/*.png
# -----------------------------------------------------------------------------
evaluate: train
	@echo "--- Step 5a: Evaluating models on validation and test sets ---"
	$(PYTHON) -m src.models.evaluate
	@echo "--- Step 5b: Computing SHAP values ---"
	$(PYTHON) -m src.models.explain


# -----------------------------------------------------------------------------
# dashboard: Launch the Streamlit dashboard (blocking)
# Depends on: all pipeline artefacts (train + evaluate recommended)
# Port is read from configs/params.yaml (default: 8501)
# -----------------------------------------------------------------------------
dashboard:
	@echo "--- Launching Streamlit dashboard ---"
	cd ../frontend && PYTHONPATH=../backend $(PYTHON) -m streamlit run app.py \
		--server.port 8501 \
		--server.headless false


# -----------------------------------------------------------------------------
# test: Run the full pytest suite with coverage report
# -----------------------------------------------------------------------------
test:
	@echo "--- Running test suite ---"
	$(PYTHON) -m pytest tests/ -v --cov=src --cov-report=term-missing


# -----------------------------------------------------------------------------
# all: Full reproducible pipeline from scratch
# WARNING: This will re-train all models, which may take several minutes.
# -----------------------------------------------------------------------------
all: clean-data features train evaluate test
	@echo ""
	@echo "=== Full pipeline complete. All artefacts reproduced. ==="
	@echo "Run 'make dashboard' to launch the interactive app."


# -----------------------------------------------------------------------------
# clean-artifacts: Remove generated artefacts (NOT raw data) to force re-run.
# Use with caution – deletes processed Parquet files and trained models.
# -----------------------------------------------------------------------------
clean-artifacts:
	@echo "--- Removing generated artefacts ---"
	rm -f data/processed/hourly_clean.parquet
	rm -f data/processed/quality_report.json
	rm -f data/features/features.parquet
	rm -f models/*.joblib
	rm -f models/conformal_widths.json
	rm -f results/validation_metrics.csv
	rm -f results/test_metrics.csv
	rm -f results/shap_values.parquet
	rm -f results/figures/*.png
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	@echo "Artefacts removed. Re-run 'make all' to regenerate."
