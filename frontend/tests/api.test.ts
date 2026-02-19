import { describe, it, expect } from "vitest";
import { getApiErrorMessage } from "@/api/client";
import { AxiosError, type AxiosResponse } from "axios";
import {
  StatusSchema,
  ForecastResponseSchema,
  HistoryResponseSchema,
  BacktestResponseSchema,
  RecommendResponseSchema,
  ExplainResponseSchema,
  SimulateResponseSchema,
  SensitivityResponseSchema,
  OutcomeDistSchema,
  FlexibleLoadInputSchema,
} from "@/types/api";

// ---------------------------------------------------------------------------
// getApiErrorMessage
// ---------------------------------------------------------------------------
describe("getApiErrorMessage", () => {
  function makeAxiosError(status: number): AxiosError {
    const err = new AxiosError("Request failed");
    err.response = { status, data: {}, statusText: "", headers: {}, config: {} as AxiosResponse["config"] } as AxiosResponse;
    return err;
  }

  it("returns correct message for known HTTP codes", () => {
    expect(getApiErrorMessage(makeAxiosError(400)).title).toBe("Invalid Request");
    expect(getApiErrorMessage(makeAxiosError(401)).title).toBe("Unauthorized");
    expect(getApiErrorMessage(makeAxiosError(403)).title).toBe("Forbidden");
    expect(getApiErrorMessage(makeAxiosError(404)).title).toBe("Not Found");
    expect(getApiErrorMessage(makeAxiosError(422)).title).toBe("Validation Error");
    expect(getApiErrorMessage(makeAxiosError(429)).title).toBe("Too Many Requests");
    expect(getApiErrorMessage(makeAxiosError(500)).title).toBe("Server Error");
    expect(getApiErrorMessage(makeAxiosError(502)).title).toBe("Bad Gateway");
    expect(getApiErrorMessage(makeAxiosError(503)).title).toBe("Service Unavailable");
  });

  it("returns Network Error when no response (e.g., server down)", () => {
    const err = new AxiosError("Network Error");
    // No response property set
    const result = getApiErrorMessage(err);
    expect(result.title).toBe("Network Error");
    expect(result.description).toContain("Cannot reach the server");
  });

  it("returns generic error for unknown status code", () => {
    const result = getApiErrorMessage(makeAxiosError(418));
    expect(result.title).toBe("Error 418");
  });

  it("returns Unexpected Error for non-Axios errors", () => {
    const result = getApiErrorMessage(new Error("Something broke"));
    expect(result.title).toBe("Unexpected Error");
    expect(result.description).toContain("Something broke");
  });

  it("handles string errors gracefully", () => {
    const result = getApiErrorMessage("string error");
    expect(result.title).toBe("Unexpected Error");
  });
});

// ---------------------------------------------------------------------------
// Zod Schema Validation
// ---------------------------------------------------------------------------
describe("Zod schemas", () => {
  describe("StatusSchema", () => {
    it("accepts valid status data", () => {
      const data = {
        current_kw: 1.23,
        today_kwh: 15.6,
        estimated_cost: 2.48,
        forecast_peak_kw: 4.5,
        forecast_peak_hour: "2026-02-19T18:00:00Z",
        alert: true,
        data_start: "2006-12-16 17:00:00",
        data_end: "2010-11-26 21:00:00",
      };
      expect(StatusSchema.parse(data)).toEqual(data);
    });

    it("rejects missing fields", () => {
      expect(() => StatusSchema.parse({ current_kw: 1.0 })).toThrow();
    });

    it("rejects wrong types", () => {
      expect(() =>
        StatusSchema.parse({
          current_kw: "not a number",
          today_kwh: 0,
          estimated_cost: 0,
          forecast_peak_kw: 0,
          forecast_peak_hour: "now",
          alert: false,
        }),
      ).toThrow();
    });
  });

  describe("ForecastResponseSchema", () => {
    it("accepts valid forecast response", () => {
      const data = {
        model: "xgboost",
        horizon: 24,
        origin: "2026-02-19T00:00:00Z",
        points: [
          { timestamp: "2026-02-19T01:00:00Z", actual: 1.5, forecast: 1.6, lower: 1.2, upper: 2.0 },
          { timestamp: "2026-02-19T02:00:00Z", actual: null, forecast: 1.4, lower: 1.0, upper: 1.8 },
        ],
      };
      const parsed = ForecastResponseSchema.parse(data);
      expect(parsed.points).toHaveLength(2);
      expect(parsed.points[1].actual).toBeNull();
    });

    it("rejects points with missing fields", () => {
      expect(() =>
        ForecastResponseSchema.parse({
          model: "xgboost",
          horizon: 24,
          origin: "2026-02-19",
          points: [{ timestamp: "2026-02-19T01:00:00Z", forecast: 1.0 }],
        }),
      ).toThrow();
    });
  });

  describe("HistoryResponseSchema", () => {
    it("accepts valid history", () => {
      const data = {
        points: [{ timestamp: "2026-02-19T01:00:00Z", value: 2.3, meter: "total" }],
        granularity: "hour",
        meter: "total",
      };
      expect(HistoryResponseSchema.parse(data).points).toHaveLength(1);
    });
  });

  describe("BacktestResponseSchema", () => {
    it("accepts valid backtest data", () => {
      const data = {
        points: [
          { origin: "2026-01-01", horizon: 1, actual: 1.5, predicted: 1.6, residual: -0.1, model: "xgboost" },
        ],
        metrics: { mae: 0.1, rmse: 0.15 },
      };
      expect(BacktestResponseSchema.parse(data).points).toHaveLength(1);
    });
  });

  describe("RecommendResponseSchema", () => {
    it("accepts valid recommend response", () => {
      const data = {
        feasible: true,
        schedule: { dishwasher: 2 },
        baseline_profile: Array(24).fill(1.0),
        optimised_profile: Array(24).fill(0.9),
        peak_reduction_kw: 0.5,
        peak_reduction_pct: 10.0,
        cost_change_eur: -0.18,
        cost_change_pct: -5.0,
        relaxation_steps: 0,
        recommendations: [
          { appliance: "Dishwasher", start_hour: 2, power_kw: 1.8, duration_h: 2, savings_cost: 0.18, shift_description: "Shift to off-peak" },
        ],
      };
      const parsed = RecommendResponseSchema.parse(data);
      expect(parsed.feasible).toBe(true);
      expect(parsed.recommendations).toHaveLength(1);
    });
  });

  describe("ExplainResponseSchema", () => {
    it("accepts valid SHAP explanation", () => {
      const data = {
        drivers: [
          { feature: "hour_of_day", shap_value: 0.45, direction: "up" },
          { feature: "lag_1h", shap_value: -0.2, direction: "down" },
        ],
        narrative: "Hour of day is the top driver.",
        hour: 18,
        origin: "2026-02-19T00:00:00Z",
      };
      const parsed = ExplainResponseSchema.parse(data);
      expect(parsed.drivers).toHaveLength(2);
    });
  });

  describe("SimulateResponseSchema", () => {
    const dist = { mean: 10, std: 1, p5: 8, p95: 12 };

    it("accepts valid simulation response", () => {
      const data = {
        daily_kwh: dist,
        peak_kw: dist,
        daily_cost: dist,
        peak_risk_hours: dist,
        percentiles: { p50: [1, 2, 3] },
      };
      expect(SimulateResponseSchema.parse(data).daily_kwh.mean).toBe(10);
    });
  });

  describe("SensitivityResponseSchema", () => {
    it("accepts valid sensitivity data", () => {
      const data = {
        bars: [{ parameter: "power_kw", low_value: 1, high_value: 3, low_outcome: 8, high_outcome: 14 }],
        baseline_value: 10,
        metric: "daily_kwh",
      };
      expect(SensitivityResponseSchema.parse(data).bars).toHaveLength(1);
    });
  });

  describe("OutcomeDistSchema", () => {
    it("validates the 4 required fields", () => {
      expect(OutcomeDistSchema.parse({ mean: 1, std: 0.1, p5: 0.8, p95: 1.2 })).toBeTruthy();
      expect(() => OutcomeDistSchema.parse({ mean: 1 })).toThrow();
    });
  });

  describe("FlexibleLoadInputSchema", () => {
    it("validates load constraints", () => {
      const valid = {
        name: "Dishwasher",
        duration_h: 2,
        power_kw: 1.8,
        earliest_start: 0,
        latest_finish: 24,
      };
      expect(FlexibleLoadInputSchema.parse(valid)).toBeTruthy();
    });

    it("rejects duration_h > 12", () => {
      expect(() =>
        FlexibleLoadInputSchema.parse({
          name: "X",
          duration_h: 15,
          power_kw: 1.0,
          earliest_start: 0,
          latest_finish: 24,
        }),
      ).toThrow();
    });

    it("rejects negative power", () => {
      expect(() =>
        FlexibleLoadInputSchema.parse({
          name: "X",
          duration_h: 1,
          power_kw: -1,
          earliest_start: 0,
          latest_finish: 24,
        }),
      ).toThrow();
    });
  });
});
