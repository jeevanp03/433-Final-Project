import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const StatusSchema = z.object({
  current_kw: z.number(),
  today_kwh: z.number(),
  estimated_cost: z.number(),
  forecast_peak_kw: z.number(),
  forecast_peak_hour: z.string(),
  alert: z.boolean(),
  data_start: z.string(),
  data_end: z.string(),
});

export type Status = z.infer<typeof StatusSchema>;

// ---------------------------------------------------------------------------
// Forecast
// ---------------------------------------------------------------------------

export const ForecastPointSchema = z.object({
  timestamp: z.string(),
  actual: z.number().nullable(),
  forecast: z.number(),
  lower: z.number(),
  upper: z.number(),
});

export const ForecastResponseSchema = z.object({
  model: z.string(),
  horizon: z.number(),
  origin: z.string(),
  points: z.array(ForecastPointSchema),
});

export type ForecastResponse = z.infer<typeof ForecastResponseSchema>;
export type ForecastPoint = z.infer<typeof ForecastPointSchema>;

export interface ForecastParams {
  model?: "xgboost" | "ridge" | "naive";
  horizon?: number;
  origin?: string | null;
  confidence?: number;
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export const HistoryPointSchema = z.object({
  timestamp: z.string(),
  value: z.number(),
  meter: z.string(),
});

export const HistoryResponseSchema = z.object({
  points: z.array(HistoryPointSchema),
  granularity: z.string(),
  meter: z.string(),
});

export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
export type HistoryPoint = z.infer<typeof HistoryPointSchema>;

export interface HistoryParams {
  from?: string;
  to?: string;
  granularity?: "hour" | "day" | "week" | "month";
  meter?: "total" | "sub1" | "sub2" | "sub3" | "other";
}

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------

export const BacktestPointSchema = z.object({
  origin: z.string(),
  horizon: z.number(),
  actual: z.number(),
  predicted: z.number(),
  residual: z.number(),
  model: z.string(),
});

export const BacktestResponseSchema = z.object({
  points: z.array(BacktestPointSchema),
  metrics: z.record(z.string(), z.number()),
});

export type BacktestResponse = z.infer<typeof BacktestResponseSchema>;
export type BacktestPoint = z.infer<typeof BacktestPointSchema>;

export interface BacktestParams {
  origin?: string;
  model_name?: "xgboost" | "ridge" | "naive";
}

// ---------------------------------------------------------------------------
// Decomposition
// ---------------------------------------------------------------------------

export const DecompositionResponseSchema = z.object({
  timestamps: z.array(z.string()),
  trend: z.array(z.number()),
  seasonal: z.array(z.number()),
  residual: z.array(z.number()),
  period: z.number(),
});

export type DecompositionResponse = z.infer<typeof DecompositionResponseSchema>;

export interface DecompositionParams {
  from?: string;
  to?: string;
  period?: number;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const MetricsResponseSchema = z.record(
  z.string(),
  z.record(z.string(), z.number()),
);

export type MetricsResponse = z.infer<typeof MetricsResponseSchema>;

// ---------------------------------------------------------------------------
// Recommend
// ---------------------------------------------------------------------------

export const FlexibleLoadInputSchema = z.object({
  name: z.string(),
  duration_h: z.number().int().min(1).max(12),
  power_kw: z.number().positive(),
  earliest_start: z.number().int().min(0).max(23),
  latest_finish: z.number().int().min(1).max(24),
  preemptable: z.boolean().optional(),
  max_deferral_h: z.number().int().min(0).max(12).optional(),
  original_start: z.number().int().nullable().optional(),
});

export type FlexibleLoadInput = z.infer<typeof FlexibleLoadInputSchema>;

export const ScheduleEntrySchema = z.object({
  appliance: z.string(),
  start_hour: z.number().int(),
  power_kw: z.number(),
  duration_h: z.number().int(),
  savings_cost: z.number(),
  shift_description: z.string(),
});

export const RecommendResponseSchema = z.object({
  feasible: z.boolean(),
  schedule: z.record(z.string(), z.number()),
  baseline_profile: z.array(z.number()),
  optimised_profile: z.array(z.number()),
  peak_reduction_kw: z.number(),
  peak_reduction_pct: z.number(),
  cost_change_eur: z.number(),
  cost_change_pct: z.number(),
  relaxation_steps: z.number(),
  recommendations: z.array(ScheduleEntrySchema),
});

export type RecommendResponse = z.infer<typeof RecommendResponseSchema>;
export type ScheduleEntry = z.infer<typeof ScheduleEntrySchema>;

export interface RecommendRequest {
  loads?: FlexibleLoadInput[];
  peak_weight?: number;
  forecast_origin?: string | null;
}

// ---------------------------------------------------------------------------
// Explain (SHAP)
// ---------------------------------------------------------------------------

export const ShapDriverSchema = z.object({
  feature: z.string(),
  shap_value: z.number(),
  direction: z.string(),
});

export const ExplainResponseSchema = z.object({
  drivers: z.array(ShapDriverSchema),
  narrative: z.string(),
  hour: z.number(),
  origin: z.string(),
});

export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
export type ShapDriver = z.infer<typeof ShapDriverSchema>;

export interface ExplainParams {
  hour?: number;
  origin?: string | null;
}

// ---------------------------------------------------------------------------
// Simulate
// ---------------------------------------------------------------------------

export const ScenarioBlockInputSchema = z.object({
  type: z.string(),
  label: z.string(),
  params: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).optional(),
});

export type ScenarioBlockInput = z.infer<typeof ScenarioBlockInputSchema>;

export const OutcomeDistSchema = z.object({
  mean: z.number(),
  std: z.number(),
  p5: z.number(),
  p95: z.number(),
});

export const SimulateResponseSchema = z.object({
  daily_kwh: OutcomeDistSchema,
  peak_kw: OutcomeDistSchema,
  daily_cost: OutcomeDistSchema,
  peak_risk_hours: OutcomeDistSchema,
  percentiles: z.record(z.string(), z.array(z.number())),
});

export type SimulateResponse = z.infer<typeof SimulateResponseSchema>;
export type OutcomeDist = z.infer<typeof OutcomeDistSchema>;

export interface SimulateRequest {
  blocks?: ScenarioBlockInput[];
  mc_runs?: number;
  seed?: number | null;
  horizon?: number;
}

// ---------------------------------------------------------------------------
// Sensitivity
// ---------------------------------------------------------------------------

export const SensitivityBarSchema = z.object({
  parameter: z.string(),
  low_value: z.number(),
  high_value: z.number(),
  low_outcome: z.number(),
  high_outcome: z.number(),
});

export const SensitivityResponseSchema = z.object({
  bars: z.array(SensitivityBarSchema),
  baseline_value: z.number(),
  metric: z.string(),
});

export type SensitivityResponse = z.infer<typeof SensitivityResponseSchema>;
export type SensitivityBar = z.infer<typeof SensitivityBarSchema>;

export interface SensitivityRequest {
  base_scenario?: ScenarioBlockInput[];
  target_metric?: string;
  parameters?: string[];
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export const UploadResponseSchema = z.object({
  filename: z.string(),
  rows_raw: z.number().int(),
  rows_clean: z.number().int(),
  date_range: z.record(z.string(), z.string()),
  columns: z.array(z.string()),
  warnings: z.array(z.string()),
});

export type UploadResponse = z.infer<typeof UploadResponseSchema>;

// ---------------------------------------------------------------------------
// Retrain
// ---------------------------------------------------------------------------

export const RetrainStatusSchema = z.object({
  running: z.boolean(),
  step: z.string(),
  progress: z.number(),
  error: z.string().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

export type RetrainStatus = z.infer<typeof RetrainStatusSchema>;

// ---------------------------------------------------------------------------
// Chat (SSE)
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  tool_calls?: ToolCallResult[];
}

export interface ToolCallResult {
  tool: string;
  status: "loading" | "done" | "error";
  result?: unknown;
}

export interface NarrationResponse {
  text: string;
  page: string;
}

export interface SuggestionsResponse {
  suggestions: string[];
}
