"""Pydantic schemas for FastAPI request/response validation."""

from __future__ import annotations

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------

class StatusResponse(BaseModel):
    current_kw: float
    today_kwh: float
    estimated_cost: float
    forecast_peak_kw: float
    forecast_peak_hour: str
    alert: bool


# ---------------------------------------------------------------------------
# Forecast
# ---------------------------------------------------------------------------

class ForecastPoint(BaseModel):
    timestamp: str
    actual: float | None = None
    forecast: float
    lower: float
    upper: float


class ForecastResponse(BaseModel):
    model: str
    horizon: int
    origin: str
    points: list[ForecastPoint]


# ---------------------------------------------------------------------------
# History
# ---------------------------------------------------------------------------

class HistoryPoint(BaseModel):
    timestamp: str
    value: float
    meter: str = "total"


class HistoryResponse(BaseModel):
    points: list[HistoryPoint]
    granularity: str
    meter: str


# ---------------------------------------------------------------------------
# Backtest
# ---------------------------------------------------------------------------

class BacktestPoint(BaseModel):
    origin: str
    horizon: int
    actual: float
    predicted: float
    residual: float
    model: str


class BacktestResponse(BaseModel):
    points: list[BacktestPoint]
    metrics: dict[str, float]


# ---------------------------------------------------------------------------
# Decomposition
# ---------------------------------------------------------------------------

class DecompositionResponse(BaseModel):
    timestamps: list[str]
    trend: list[float]
    seasonal: list[float]
    residual: list[float]
    period: int


# ---------------------------------------------------------------------------
# Recommendation / Optimisation
# ---------------------------------------------------------------------------

class FlexibleLoadInput(BaseModel):
    name: str
    duration_h: int = Field(ge=1, le=12)
    power_kw: float = Field(gt=0)
    earliest_start: int = Field(ge=0, le=23)
    latest_finish: int = Field(ge=1, le=24)
    preemptable: bool = False
    max_deferral_h: int = Field(default=6, ge=0, le=12)
    original_start: int | None = None


class RecommendRequest(BaseModel):
    loads: list[FlexibleLoadInput] | None = None
    peak_weight: float = Field(default=0.5, ge=0.0, le=1.0)
    forecast_origin: str | None = None


class ScheduleEntry(BaseModel):
    appliance: str
    start_hour: int
    power_kw: float
    duration_h: int
    savings_cost: float
    shift_description: str


class RecommendResponse(BaseModel):
    feasible: bool
    schedule: dict[str, int]
    baseline_profile: list[float]
    optimised_profile: list[float]
    peak_reduction_kw: float
    peak_reduction_pct: float
    cost_change_eur: float
    cost_change_pct: float
    relaxation_steps: int
    recommendations: list[ScheduleEntry]


# ---------------------------------------------------------------------------
# Explain (SHAP)
# ---------------------------------------------------------------------------

class ShapDriver(BaseModel):
    feature: str
    shap_value: float
    direction: str


class ExplainResponse(BaseModel):
    drivers: list[ShapDriver]
    narrative: str
    hour: int
    origin: str


# ---------------------------------------------------------------------------
# Simulation
# ---------------------------------------------------------------------------

class ScenarioBlockInput(BaseModel):
    type: str
    label: str
    params: dict[str, float | str | bool] = {}


class SimulateRequest(BaseModel):
    blocks: list[ScenarioBlockInput] = []
    mc_runs: int = Field(default=200, ge=50, le=1000)
    seed: int | None = None
    horizon: int = Field(default=24, ge=6, le=168)


class OutcomeDist(BaseModel):
    mean: float
    std: float
    p5: float
    p95: float


class SimulateResponse(BaseModel):
    daily_kwh: OutcomeDist
    peak_kw: OutcomeDist
    daily_cost: OutcomeDist
    peak_risk_hours: OutcomeDist
    percentiles: dict[str, list[float]]


# ---------------------------------------------------------------------------
# Sensitivity
# ---------------------------------------------------------------------------

class SensitivityBar(BaseModel):
    parameter: str
    low_value: float
    high_value: float
    low_outcome: float
    high_outcome: float


class SensitivityRequest(BaseModel):
    base_scenario: list[ScenarioBlockInput] = []
    target_metric: str = "daily_cost"
    parameters: list[str] = []


class SensitivityResponse(BaseModel):
    bars: list[SensitivityBar]
    baseline_value: float
    metric: str


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

class UploadResponse(BaseModel):
    filename: str
    rows_raw: int
    rows_clean: int
    date_range: dict[str, str]
    columns: list[str]
    warnings: list[str]
