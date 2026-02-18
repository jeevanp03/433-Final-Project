# Household Energy Cost & Usage Dashboard

MSE 433 Final Project — an end-to-end machine-learning pipeline that ingests
the UCI Individual Household Electric Power Consumption dataset (2,075,259
minute-level rows), produces hourly XGBoost forecasts with conformal prediction
intervals, and surfaces prescriptive load-shift recommendations through an
interactive Streamlit dashboard.

**Stakeholders:** homeowners seeking to understand and reduce energy spend;
utility-portal teams embedding a demand-analytics widget.

**Capabilities:** descriptive (historical usage patterns), predictive (24 h and
7-day hourly forecasts with 90 % prediction intervals), and prescriptive
(MILP load-shift recommendations against a 3-tier TOU tariff).

Full design specification: `Planning/Energy_Dashboard_Design_Document.pdf`

---

## Results at a Glance

| Metric | Seasonal Naive | Ridge | XGBoost |
|---|---|---|---|
| Test MAE (kW) | 0.566 | 0.212 | 0.276 |
| Improvement vs Naive | — | 62.5 % | 51.2 % |

| Dataset | Count |
|---|---|
| Raw minute rows | 2,075,259 |
| Clean hourly rows | 34,169 |
| Feature matrix (rows x cols) | 34,001 x 34 |
| Test suite | 47 tests passing |

Conformal prediction half-widths (90 % coverage target): h=1 → **1.04 kW**, h=24 → **1.27 kW**.

---

## Project Structure

```
433-Final-Project/
├── backend/
│   ├── configs/
│   │   └── params.yaml               All hyperparameters, paths, and constants
│   ├── data/
│   │   ├── raw/                      UCI CSV (not committed to git)
│   │   ├── processed/                hourly_clean.parquet, quality_report.json,
│   │   │                             SCHEMA.md
│   │   └── features/                 features.parquet
│   ├── models/                       Serialised joblib files, conformal_widths.json
│   ├── notebooks/
│   │   ├── 01_eda.ipynb              Exploratory data analysis
│   │   └── 02_report_figures.ipynb   Publication-quality figures
│   ├── results/
│   │   ├── figures/                  Publication-quality PNGs
│   │   ├── validation_metrics.csv
│   │   └── test_metrics.csv
│   ├── src/
│   │   ├── skills/                   14 shared utility modules
│   │   ├── ingestion/                load.py, clean.py
│   │   ├── features/                 engineer.py
│   │   ├── models/                   base.py, baseline.py, xgb.py, ridge.py,
│   │   │                             evaluate.py, conformal.py, explain.py
│   │   └── prescriptive/             constraints.py, pricing.py, optimiser.py
│   ├── tests/                        47 unit + integration tests
│   ├── Makefile
│   └── requirements.txt
├── frontend/
│   ├── app.py                        Streamlit entry point
│   ├── components/                   status_bar, forecast_panel, history,
│   │                                 recommendations, explainer
│   └── requirements.txt
├── Planning/                         Design document PDFs
└── README.md                         This file
```

---

## Architecture

Five-layer modular pipeline with Parquet data contracts between stages:

```
[Raw CSV] → load.py → [Minute DF] → clean.py → [Hourly Parquet]
                                                       |
                                                 engineer.py
                                                       |
                                               [Feature Parquet]
                                               /               \
                                           xgb.py           ridge.py
                                               \               /
                                            [Forecast JSON]
                                                       |
                                               optimiser.py
                                                       |
                                          [Recommendation JSON]
                                                       |
                                              [Dashboard UI]
```

---

## Module Descriptions

| Module | Responsibility |
|---|---|
| `src/ingestion/load.py` | Reads raw UCI CSV into a pandas DataFrame with a DatetimeIndex; logs shape and null counts. |
| `src/ingestion/clean.py` | Resamples to hourly, fills short gaps (<=4 h), drops long gaps, saves `hourly_clean.parquet` and `quality_report.json`. |
| `src/features/engineer.py` | Builds the 34-column feature matrix (calendar, lag, rolling, sub-meter share features) with strict leakage prevention. |
| `src/models/base.py` | Abstract `Forecaster` base class enforcing a uniform `fit / predict / evaluate` interface. |
| `src/models/baseline.py` | Seasonal-naive benchmark: y_hat(t+h) = y(t-168+h). |
| `src/models/ridge.py` | Direct multi-step Ridge regression — 24 independent pipelines with TimeSeriesSplit CV alpha selection. |
| `src/models/xgb.py` | Direct multi-step XGBoost — 24 independent regressors with early stopping; primary model. |
| `src/models/evaluate.py` | Rolling-window backtesting harness; saves `validation_metrics.csv` and `test_metrics.csv`. |
| `src/models/conformal.py` | Split-conformal prediction intervals (90 % target coverage) using per-horizon validation residuals. |
| `src/models/explain.py` | SHAP TreeExplainer analysis; saves `shap_values.parquet` and bee-swarm summary plot. |
| `src/prescriptive/constraints.py` | `FlexibleLoad` dataclass and default appliance configurations from params.yaml. |
| `src/prescriptive/pricing.py` | 3-tier TOU tariff schedule (off-peak / mid-peak / on-peak); hourly cost computation. |
| `src/prescriptive/optimiser.py` | MILP load-shift engine (PuLP/CBC); minimises weighted peak and cost with incremental infeasibility relaxation. |

---

## Setup

**Prerequisites:** Python 3.10 or later.

```bash
# 1. Clone the repository
git clone <repo-url>
cd 433-Final-Project

# 2. Create and activate a virtual environment
cd backend
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

# 3. Install dependencies
pip install -r requirements.txt
# or
make install

# 4. Download the UCI dataset (one-time setup, ~25 MB)
python - <<'EOF'
from ucimlrepo import fetch_ucirepo
import os
ds = fetch_ucirepo(id=235)
df = ds.data.features.join(ds.data.targets)
os.makedirs("data/raw", exist_ok=True)
df.to_csv("data/raw/household_power_consumption.txt", sep=";", index=False)
print(f"Saved {len(df):,} rows to data/raw/")
EOF
```

Dataset: UCI ML Repository — Individual Household Electric Power Consumption
(id=235): https://archive.ics.uci.edu/dataset/235

---

## Reproducing All Results

### Option 1 — Makefile (recommended)

Run all commands from `backend/`:

```bash
make all          # Full pipeline: clean → features → train → evaluate → test
```

Individual targets:

```bash
make ingest       # Step 1: Load raw CSV, log shape and null counts
make clean-data   # Step 2: Hourly resampling, gap-filling → Parquet
make features     # Step 3: Build feature matrix → features.parquet
make train        # Step 4: Train XGBoost + Ridge (24 models each) + conformal
make evaluate     # Step 5: Backtesting metrics + SHAP values
make test         # Run pytest with coverage
```

### Option 2 — Step by step

```bash
cd backend
python -m src.ingestion.load
python -m src.ingestion.clean
python -m src.features.engineer
python -m src.models.baseline
python -m src.models.ridge
python -m src.models.xgb
python -m src.models.evaluate
python -m src.models.conformal
python -m src.models.explain
```

---

## Launch Dashboard

```bash
# From backend/ (uses Makefile):
make dashboard

# Or manually from the project root:
cd frontend && PYTHONPATH=../backend streamlit run app.py
```

Dashboard is available at http://localhost:8501.

---

## Run Tests

```bash
cd backend

pytest tests/ -v                              # All 47 tests
pytest tests/test_features.py -v             # Feature leakage tests only
pytest tests/ --cov=src --cov-report=html    # With HTML coverage report
```

Key acceptance criteria enforced by tests:

- XGBoost MAE beats Seasonal Naive by >= 15 % on validation
- Conformal PI coverage >= 85 % on test set
- No feature leakage (every feature at row i uses only t < t_i data)
- Prescriptive optimizer produces a feasible schedule for all default loads

---

## Configuration

All configurable values live in `backend/configs/params.yaml`. Source files
load the config via `src.skills.config_loader`:

```python
from src.skills.config_loader import load_config, get_param

cfg = load_config()                              # Full dict
lr  = get_param("model.xgboost.learning_rate")  # Dot-path accessor
```

Key sections in `params.yaml`:

| Section | Description |
|---|---|
| `paths` | All file paths (raw CSV, Parquet artefacts, model dirs) |
| `data` | Target column, resample rules, gap-filling thresholds |
| `splits` | Temporal train / val / test date boundaries |
| `features` | Lag indices, rolling windows, EWMA half-life |
| `model.xgboost` | n_estimators=300, max_depth=5, learning_rate=0.05, etc. |
| `model.ridge` | Alpha candidates, CV splits |
| `evaluation` | Metrics list, acceptance thresholds |
| `conformal` | Coverage target (0.90) and residual quantile (0.95) |
| `prescriptive` | Peak weight, default flexible loads, TOU pricing |
| `dashboard` | Port, page title, horizon options, alert thresholds |

---

## Models

| Model | Strategy | Notes |
|---|---|---|
| Seasonal Naive | y(t) = y(t-168) | Benchmark, no training required |
| Ridge | Direct multi-step, 24 models | Alpha via TimeSeriesSplit CV; StandardScaler pipeline |
| XGBoost | Direct multi-step, 24 models | Primary model; early stopping on val MAE |

**Temporal splits (strictly chronological — no random shuffling):**
- Train: Dec 2006 – Dec 2008
- Validate: Jan 2009 – Jun 2010 (rolling 24 h windows)
- Test: Jul 2010 – Nov 2010 (held out until final evaluation)

---

## Colour Palette

Defined in `backend/src/skills/plotly_theme.py` and registered as a Plotly template.

| Role | Hex |
|---|---|
| Headers / text | `#1B2A4A` (Navy) |
| Accent / forecast | `#2E75B6` (Blue) |
| Alerts | `#E8792F` (Orange) |
| Danger | `#D32F2F` (Red) |
| Success | `#388E3C` (Green) |
| Background | `#F7F8FA` (Light Grey) |
| Cards | `#FFFFFF` (White) |

---

## License

Academic use only — MSE 433, 2026.
