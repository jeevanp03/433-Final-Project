import { z } from "zod/v4";

export const StatusSchema = z.object({
  current_kw: z.number(),
  today_kwh: z.number(),
  estimated_cost: z.number(),
  forecast_peak_kw: z.number(),
  forecast_peak_hour: z.string(),
  alert: z.boolean(),
});

export type Status = z.infer<typeof StatusSchema>;

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
