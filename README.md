# Household Energy Cost & Usage Dashboard

MSE 433 Final Project — an end-to-end machine-learning pipeline that ingests
the UCI Individual Household Electric Power Consumption dataset (2,075,259
minute-level rows), produces hourly XGBoost forecasts with conformal prediction
intervals, and surfaces prescriptive load-shift recommendations through an
interactive React dashboard backed by a FastAPI server with an LLM-powered
chat assistant.

**Stakeholders:** homeowners seeking to understand and reduce energy spend;
utility-portal teams embedding a demand-analytics widget.

**Capabilities:** descriptive (historical usage patterns), predictive (24 h and
7-day hourly forecasts with 90 % prediction intervals), and prescriptive
(MILP load-shift recommendations against a 3-tier TOU tariff). Defaults to
Canada / CAD with configurable region and currency.

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
| Backend test suite | 47 tests passing |
| Frontend test suite | 100 tests passing |
| Rolling backtest origins | 618 |
| Prediction records | 30,282 |
| Error slicing dimensions | 5 |

Conformal prediction half-widths (90 % coverage target): h=1 → **1.04 kW**, h=24 → **1.27 kW**.

**Rolling backtest** (618 origins, step=21 h across 18-month validation window) with error slicing across 5 dimensions: hour of day, day of week, month, forecast horizon (h=1..24), and demand tercile (low/medium/high).

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
│   │   ├── test_metrics.csv
│   │   ├── backtest_results.parquet  30,282 rolling-window predictions
│   │   └── error_slices.csv          Error analysis across 5 dimensions
│   ├── src/
│   │   ├── skills/                   14 shared utility modules
│   │   ├── ingestion/                load.py, clean.py
│   │   ├── features/                 engineer.py
│   │   ├── models/                   base.py, baseline.py, xgb.py, ridge.py,
│   │   │                             evaluate.py, conformal.py, explain.py
│   │   └── prescriptive/             constraints.py, pricing.py, optimiser.py
│   ├── server/                       FastAPI backend server
│   │   ├── routers/                  REST API endpoints (forecast, simulate, chat)
│   │   ├── llm/                      Ollama LLM orchestrator, tools, prompts
│   │   ├── deps.py                   Lazy model/data loading
│   │   ├── schemas.py                Pydantic request/response models
│   │   └── main.py                   FastAPI app entry point
│   ├── tests/                        47 unit + integration tests
│   ├── Makefile
│   └── requirements.txt
├── frontend/                         React 19 + TypeScript SPA (Vite 7)
│   ├── src/
│   │   ├── api/                      Axios client, TanStack Query hooks
│   │   ├── components/
│   │   │   ├── ui/                   shadcn/ui primitives
│   │   │   ├── charts/               ForecastChart, FanChart, Heatmap, etc.
│   │   │   ├── controls/             DateRangePicker, HorizonToggle, etc.
│   │   │   ├── cards/                KpiCard, RecommendationCard, etc.
│   │   │   ├── chat/                 ChatDrawer, MessageBubble, etc.
│   │   │   └── layout/               Sidebar, TopBar, AppLayout
│   │   ├── pages/                    7 pages: Dashboard, Forecast, Simulate,
│   │   │                             Analytics, Actions, Settings, Onboarding
│   │   ├── stores/                   7 Zustand state slices
│   │   ├── hooks/                    Custom React hooks
│   │   ├── lib/                      Utility functions
│   │   ├── types/                    TypeScript types + Zod schemas
│   │   └── theme/                    Chart theme config
│   ├── tests/                        100 Vitest unit + component + integration tests
│   ├── package.json
│   ├── vitest.config.ts
│   └── vite.config.ts
├── frontend-streamlit/               Old Streamlit frontend (archived)
├── Planning/                         Design document PDFs
└── README.md                         This file
```

---

## Architecture

Five-layer ML pipeline with Parquet data contracts, served via FastAPI to a React SPA:

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
                                              FastAPI Server (:8000)
                                                       |
                                           React Dashboard (:5173)
```

**Frontend stack:** React 19, TypeScript 5.9 (strict), Vite 7, Tailwind CSS 4, shadcn/ui, Recharts, D3, Zustand, TanStack Query, Framer Motion, Zod.

**Backend API:** FastAPI with lazy model loading, SSE streaming for LLM chat, Ollama integration.

**First-run onboarding:** A 3-step setup wizard (region/currency, household profile,
LLM connection) is shown on first visit. Settings persist in localStorage and can
be changed later on the Settings page. A "Skip setup" link applies sensible defaults
(Canada, CAD).

**Progressive disclosure (Density Toggle):** Each page supports three information
density levels selectable from the top bar:

| Level | Shows |
|---|---|
| **Glance** | KPI cards and headers only — at-a-glance status |
| **Explore** | KPIs + main charts, recommendations, and controls |
| **Deep Dive** | Everything including backtests, SHAP explanations, heatmaps, decomposition, and AI insights |

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
| `src/models/evaluate.py` | Rolling-window backtesting harness (618 origins); saves metrics CSVs, `backtest_results.parquet`, and `error_slices.csv` with 5-dimension error analysis. |
| `src/models/conformal.py` | Split-conformal prediction intervals (90 % target coverage) using per-horizon validation residuals. |
| `src/models/explain.py` | SHAP TreeExplainer analysis; saves `shap_values.parquet` and bee-swarm summary plot. |
| `src/prescriptive/constraints.py` | `FlexibleLoad` dataclass and default appliance configurations from params.yaml. |
| `src/prescriptive/pricing.py` | 3-tier TOU tariff schedule (off-peak / mid-peak / on-peak); hourly cost computation. |
| `src/prescriptive/optimiser.py` | MILP load-shift engine (PuLP/CBC); minimises weighted peak and cost with incremental infeasibility relaxation. |
| `server/main.py` | FastAPI app with CORS, mounts all API routers. |
| `server/routers/` | REST endpoints: status, forecast, history, backtest, simulate, recommend, explain, chat. |
| `server/llm/` | Ollama LLM orchestrator with 10 tool functions, SSE streaming, safety guardrails. |

---

## Setup

**Prerequisites:** Python 3.10+, Node.js 18+.

### 1. Environment Variables

Copy the example env file at the **project root** and adjust as needed:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `API_PORT` | `8000` | FastAPI server port |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama LLM server URL |
| `OLLAMA_MODEL` | `deepseek-r1:1.5b` | Default model for chat/narration |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Allowed CORS origins (comma-separated) |
| `VITE_API_URL` | `/api` | API base URL used by the React frontend (proxied by Vite) |
| `VITE_OLLAMA_URL` | `http://localhost:11434` | Ollama URL exposed to frontend settings |
| `VITE_OLLAMA_MODEL` | `deepseek-r1:1.5b` | LLM model name shown in frontend |

The backend reads `OLLAMA_*` variables directly. The frontend reads `VITE_*` variables via Vite's env injection. Both can share a single root `.env` file.

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

pip install -r requirements.txt
# or: make install

# Download the UCI dataset (one-time, ~25 MB)
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

### 3. Frontend Setup

```bash
cd frontend
npm install
```

### 4. LLM Setup (Optional — for chat assistant)

The dashboard includes an AI chat assistant powered by [Ollama](https://ollama.com).
This is **optional** — all forecast, analytics, and recommendation features work
without it. The chat panel gracefully degrades when Ollama is unavailable.

```bash
# 1. Install Ollama (macOS)
brew install ollama
# Or download from https://ollama.com/download

# 2. Start the Ollama server
ollama serve

# 3. Pull a model (choose one)
ollama pull deepseek-r1:1.5b      # Default (~2 GB RAM)
ollama pull deepseek-r1:7b        # More capable (~7 GB RAM)
ollama pull llama3:8b              # Alternative (~8 GB RAM)

# 4. Verify it's running
curl http://localhost:11434/api/tags
```

Set `OLLAMA_MODEL` and `VITE_OLLAMA_MODEL` in `.env` to change the model.
The model is **read-only** in the UI (configured via environment variables only).

**Without Ollama:** Chat drawer shows an offline message. Auto-narration panels
display a retry button. All other dashboard features work normally.

---

## Reproducing All Results

### Option 1 — Makefile (recommended)

Run all commands from `backend/`. The Makefile auto-detects the `.venv/` virtual
environment — you do not need to activate it first:

```bash
make all          # Full pipeline: clean -> features -> train -> evaluate -> test
```

Individual targets:

```bash
make ingest       # Step 1: Load raw CSV, log shape and null counts
make clean-data   # Step 2: Hourly resampling, gap-filling -> Parquet
make features     # Step 3: Build feature matrix -> features.parquet
make train        # Step 4: Train XGBoost + Ridge (24 models each) + conformal
make evaluate     # Step 5: Backtesting metrics + SHAP values
make test         # Run pytest with coverage
```

### Option 2 — Step by step

```bash
cd backend
source .venv/bin/activate    # activate venv for manual commands
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

## Launch Application

### Quick start (one terminal)

```bash
cd backend
make dev
```

This launches the FastAPI server (`:8000`) and React dev server (`:5173`) together.
`Ctrl+C` stops both. The dashboard is available at **http://localhost:5173**.

### Full start with LLM chat (3 terminals)

| Terminal | Command | Purpose |
|---|---|---|
| 1 | `ollama serve` | LLM server (optional — for chat assistant) |
| 2 | `cd backend && make server` | FastAPI backend on port 8000 |
| 3 | `cd frontend && npm run dev` | React dev server on port 5173 |

The API proxy forwards `/api/*` requests from the frontend to FastAPI at `:8000`.
If Ollama is not running, the chat drawer shows an offline message and all other
features work normally.

### Production build

```bash
cd frontend
npm run build     # Outputs to frontend/dist/
npm run preview   # Preview the production build
```

---

## Run Tests

### Backend tests (Python)

```bash
cd backend

pytest tests/ -v                              # All 47 tests
pytest tests/test_features.py -v             # Feature leakage tests only
pytest tests/ --cov=src --cov-report=html    # With HTML coverage report
```

### Frontend tests (TypeScript)

```bash
cd frontend

npm test                  # Run all 100 tests (vitest run)
npm run test:watch        # Watch mode for development
```

**Frontend test coverage (100 tests):**

| Category | Tests | Files |
|---|---|---|
| Zustand stores (7 stores) | 46 | `tests/stores.test.ts` |
| API client + Zod schemas | 20 | `tests/api.test.ts` |
| Component tests | 22 | `tests/components.test.tsx` |
| SSE + integration | 12 | `tests/integration.test.ts` |

Key acceptance criteria enforced by tests:

- XGBoost MAE beats Seasonal Naive by >= 15 % on validation
- Conformal PI coverage >= 85 % on test set
- No feature leakage (every feature at row i uses only t < t_i data)
- Prescriptive optimizer produces a feasible schedule for all default loads
- All 7 Zustand stores reset correctly with proper state isolation
- Zod schemas reject malformed API responses
- KpiCard threshold/delta rendering and RecommendationCard action lifecycle

---

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/status` | GET | Current kW, today's kWh, estimated cost, alert |
| `/api/forecast` | GET | 24h or 168h forecast with prediction intervals |
| `/api/history` | GET | Historical actuals by date range and granularity |
| `/api/backtest` | GET | Rolling backtest results for validation origins |
| `/api/decompose` | GET | STL decomposition (trend/seasonal/residual) |
| `/api/metrics` | GET | Model evaluation metrics by split |
| `/api/recommend` | GET/POST | Load-shift optimization with constraints |
| `/api/explain` | GET | SHAP-based explanation for a forecast hour |
| `/api/simulate` | POST | Monte Carlo simulation with scenario blocks |
| `/api/sensitivity` | POST | Tornado-chart sensitivity analysis |
| `/api/upload` | POST | Upload custom CSV dataset (multipart) |
| `/api/chat` | POST | LLM chat with SSE streaming |
| `/api/chat/narrate` | POST | Auto-narration for dashboard page |
| `/api/chat/suggest` | POST | Context-aware suggestion chips |

---

## Custom Data Upload

Users can replace the built-in UCI dataset with their own household power data
via **Settings > Dataset** or `POST /api/upload`.

### Expected CSV Format

Semicolon-delimited (`;`) with these columns:

| Column | Type | Example |
|---|---|---|
| `Date` | `dd/mm/yyyy` | `16/12/2006` |
| `Time` | `HH:MM:SS` | `17:24:00` |
| `Global_active_power` | float (kW) | `4.216` |
| `Global_reactive_power` | float (kW) | `0.418` |
| `Voltage` | float (V) | `234.840` |
| `Global_intensity` | float (A) | `18.400` |
| `Sub_metering_1` | float (Wh) | `0.000` |
| `Sub_metering_2` | float (Wh) | `1.000` |
| `Sub_metering_3` | float (Wh) | `17.000` |

Missing values should use `?` (same as the UCI dataset convention).

### How It Works

1. Go to **Settings > Dataset** and drag-and-drop a CSV or click to browse.
2. The server parses the file, validates required columns, resamples to hourly,
   fills short gaps, drops long gaps, and computes `Other_consumption`.
3. The cleaned data replaces `data/processed/hourly_clean.parquet`.
4. All server caches are cleared, and the dashboard refreshes with the new data.

**Note:** Uploading replaces the current dataset. Pre-trained models were fitted
on the UCI data and may not generalize perfectly to a different household's
consumption patterns.

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
- Train: Dec 2006 -- Dec 2008
- Validate: Jan 2009 -- Jun 2010 (rolling 24 h windows)
- Test: Jul 2010 -- Nov 2010 (held out until final evaluation)

---

## Colour Palette

Defined in `backend/src/skills/plotly_theme.py` (backend) and `frontend/src/theme/chartTheme.ts` + `frontend/src/index.css` (frontend).

| Role | Hex |
|---|---|
| Headers / text | `#1B2A4A` (Navy) |
| Accent / forecast | `#2E75B6` (Blue) |
| Simulation | `#26A69A` (Teal) |
| Alerts | `#E8792F` (Orange) |
| Danger | `#D32F2F` (Red) |
| Success | `#388E3C` (Green) |
| Background | `#F7F8FA` (Light Grey) |
| Cards | `#FFFFFF` (White) |

---

## License

Academic use only — MSE 433, 2026.
