import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useForecastStore, type Horizon, type ModelId } from "@/stores/useForecastStore";
import { useAnalyticsStore, type Granularity } from "@/stores/useAnalyticsStore";

const VALID_HORIZONS: Horizon[] = ["6h", "12h", "24h", "48h", "7d", "14d"];
const VALID_MODELS: ModelId[] = ["naive", "ridge", "xgboost"];
const VALID_GRANULARITIES: Granularity[] = ["minute", "hour", "day", "week", "month"];

/**
 * Syncs Forecast and Analytics store state with URL search params.
 * Call this hook once in the Forecast or Analytics page component.
 *
 * Supported params:
 *   ?horizon=24h&model=xgboost,ridge&origin=2010-01-15T00:00&confidence=90
 *   ?granularity=hour&from=2009-01-01&to=2009-06-30&meter=kitchen,laundry
 */
export function useUrlState(page: "forecast" | "analytics") {
  const [searchParams, setSearchParams] = useSearchParams();

  // Forecast store
  const forecastStore = useForecastStore();
  // Analytics store
  const analyticsStore = useAnalyticsStore();

  // Read URL -> store on mount
  useEffect(() => {
    if (page === "forecast") {
      const horizon = searchParams.get("horizon");
      if (horizon && VALID_HORIZONS.includes(horizon as Horizon)) {
        forecastStore.setHorizon(horizon as Horizon);
      }

      const models = searchParams.get("model");
      if (models) {
        const parsed = models.split(",").filter((m): m is ModelId => VALID_MODELS.includes(m as ModelId));
        if (parsed.length > 0) forecastStore.setSelectedModels(parsed);
      }

      const origin = searchParams.get("origin");
      if (origin) forecastStore.setOrigin(origin);

      const confidence = searchParams.get("confidence");
      if (confidence) {
        const n = parseInt(confidence, 10);
        if (!isNaN(n)) forecastStore.setConfidence(n);
      }
    }

    if (page === "analytics") {
      const granularity = searchParams.get("granularity");
      if (granularity && VALID_GRANULARITIES.includes(granularity as Granularity)) {
        analyticsStore.setGranularity(granularity as Granularity);
      }

      const from = searchParams.get("from");
      const to = searchParams.get("to");
      if (from && to) analyticsStore.setDateRange([from, to]);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Write store -> URL on state change
  useEffect(() => {
    const params = new URLSearchParams();

    if (page === "forecast") {
      params.set("horizon", forecastStore.horizon);
      params.set("model", forecastStore.selectedModels.join(","));
      if (forecastStore.origin) params.set("origin", forecastStore.origin);
      if (forecastStore.confidence !== 90) {
        params.set("confidence", String(forecastStore.confidence));
      }
    }

    if (page === "analytics") {
      params.set("granularity", analyticsStore.granularity);
      if (analyticsStore.dateRange) {
        params.set("from", analyticsStore.dateRange[0]);
        params.set("to", analyticsStore.dateRange[1]);
      }
    }

    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    page,
    forecastStore.horizon,
    forecastStore.selectedModels,
    forecastStore.origin,
    forecastStore.confidence,
    analyticsStore.granularity,
    analyticsStore.dateRange,
  ]);
}
