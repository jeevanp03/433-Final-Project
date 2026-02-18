# Household Energy Cost & Usage Dashboard

MSE 433 Final Project — an end-to-end machine-learning pipeline that ingests
the UCI Individual Household Electric Power Consumption dataset (~2 M minute-
level rows), produces hourly XGBoost forecasts with conformal prediction
intervals, and surfaces prescriptive load-shift recommendations through an
interactive Streamlit dashboard.

---

## Project Structure

```
.
├── backend/
│   ├── configs/
│   │   └── params.yaml               All hyperparameters, paths, and constants
│   ├── data/
│   │   ├── raw/                      UCI CSV (not committed to git)
│   │   ├── processed/                hourly_clean.parquet, quality_report.json
│   │   └── features/                 features.parquet
│   ├── models/                       Serialised joblib files, conformal_widths.json
│   ├── notebooks/
│   │   ├── 01_eda.ipynb
│   │   └── 02_report_figures.ipynb
│   ├── results/
│   │   └── figures/                  Publication-quality PNGs
│   ├── src/
│   │   ├── skills/                   Shared utility modules (14 modules)
│   │   ├── ingestion/                load.py, clean.py
│   │   ├── features/                 engineer.py
│   │   ├── models/                   base.py, baseline.py, xgb.py, ridge.py,
│   │   │                             evaluate.py, conformal.py, explain.py
│   │   └── prescriptive/             constraints.py, pricing.py, optimiser.py
│   ├── tests/                        Unit + integration tests
│   ├── Makefile
│   └── requirements.txt
├── frontend/
│   ├── app.py                        Streamlit entry point
│   ├── components/                   status_bar, forecast_panel, history,
│   │                                 recommendations, explainer
│   └── requirements.txt
└── README.md                         (this file)
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

## Setup

**Prerequisites:** Python 3.10 or later.

```bash
# 1. Clone the repo
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
import os, shutil
ds = fetch_ucirepo(id=235)
df = ds.data.features.join(ds.data.targets)
os.makedirs("data/raw", exist_ok=True)
df.to_csv("data/raw/household_power_consumption.txt", sep=";", index=False)
print(f"Saved {len(df):,} rows to data/raw/")
EOF
```

---

## Usage (Makefile Targets)

Run all `make` commands from the `backend/` directory:

```bash
cd backend
make ingest       # Step 1: Load raw CSV, log shape and null counts
make clean-data   # Step 2: Hourly resampling, gap-filling → Parquet
make features     # Step 3: Build feature matrix → features.parquet
make train        # Step 4: Train XGBoost + Ridge (24 models each)
make evaluate     # Step 5: Backtesting metrics + SHAP values
make dashboard    # Launch Streamlit on http://localhost:8501
make test         # Run pytest with coverage
make all          # Full pipeline end-to-end (clean-data → test)
```

---

## Configuration

All configurable values live in `backend/configs/params.yaml`.  Source files load
the config via `src.skills.config_loader`:

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
| `model.xgboost` | n_estimators, max_depth, learning_rate, etc. |
| `model.ridge` | Alpha candidates, CV splits |
| `evaluation` | Metrics list, acceptance thresholds |
| `conformal` | Coverage target and residual quantile |
| `prescriptive` | Peak weight, default flexible loads, TOU pricing |
| `dashboard` | Port, page title, horizon options, alert thresholds |

---

## Models

| Model | Strategy | Notes |
|---|---|---|
| Seasonal Naive | y(t) = y(t-168) | Benchmark, no training |
| Ridge | Direct multi-step, 24 models | Alpha via TimeSeriesSplit CV |
| XGBoost | Direct multi-step, 24 models | Primary model |

**Temporal splits (never random):**
- Train: Dec 2006 – Dec 2008
- Validate: Jan 2009 – Jun 2010 (rolling 24 h windows)
- Test: Jul 2010 – Nov 2010 (held out until final evaluation)

---

## Testing

Run tests from the `backend/` directory:

```bash
cd backend
pytest tests/ -v                              # All tests
pytest tests/test_features.py -v             # Leakage tests only
pytest tests/ --cov=src --cov-report=html    # With HTML coverage report
```

Key acceptance criteria enforced by tests:
- XGBoost MAE beats Seasonal Naive by >= 15 % on validation
- Conformal PI coverage >= 85 % on test set
- No feature leakage (every feature at row i uses only t < t_i data)
- Prescriptive optimizer produces a feasible schedule for all default loads

---

## Colour Palette

| Role | Hex |
|---|---|
| Headers / text | `#1B2A4A` (Navy) |
| Accent / forecast | `#2E75B6` (Blue) |
| Alerts | `#E8792F` (Orange) |
| Danger | `#D32F2F` (Red) |
| Success | `#388E3C` (Green) |
| Background | `#F7F8FA` (Light Grey) |
| Cards | `#FFFFFF` (White) |

Defined in `backend/src/skills/plotly_theme.py` and registered as a Plotly template.

---

## License

[Placeholder – add your institution's academic use statement here.]
