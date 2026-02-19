import { useQuery, useMutation, useQueryClient, queryOptions } from "@tanstack/react-query";
import { api } from "./client";
import type {
  BacktestParams,
  BacktestResponse,
  DecompositionParams,
  DecompositionResponse,
  ExplainParams,
  ExplainResponse,
  ForecastParams,
  ForecastResponse,
  HistoryParams,
  HistoryResponse,
  MetricsResponse,
  RecommendRequest,
  RecommendResponse,
  RetrainStatus,
  SensitivityRequest,
  SensitivityResponse,
  SimulateRequest,
  SimulateResponse,
  Status,
  UploadResponse,
} from "@/types/api";

// ---------------------------------------------------------------------------
// GET /api/status — 30s stale, auto-refetch
// ---------------------------------------------------------------------------

export function statusQueryOptions() {
  return queryOptions<Status>({
    queryKey: ["status"],
    queryFn: async () => (await api.get<Status>("/status")).data,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useStatus() {
  return useQuery(statusQueryOptions());
}

// ---------------------------------------------------------------------------
// GET /api/forecast — 5min stale, keyed by params
// ---------------------------------------------------------------------------

export function forecastQueryOptions(params: ForecastParams = {}) {
  return queryOptions<ForecastResponse>({
    queryKey: ["forecast", params],
    queryFn: async () => {
      const { data } = await api.get<ForecastResponse>("/forecast", {
        params: {
          model: params.model ?? "xgboost",
          horizon: params.horizon ?? 24,
          origin: params.origin ?? undefined,
          confidence: params.confidence ?? 90,
        },
      });
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useForecast(params: ForecastParams = {}) {
  return useQuery(forecastQueryOptions(params));
}

// ---------------------------------------------------------------------------
// GET /api/history — immutable (Infinity stale)
// ---------------------------------------------------------------------------

export function historyQueryOptions(params: HistoryParams = {}) {
  return queryOptions<HistoryResponse>({
    queryKey: ["history", params],
    queryFn: async () => {
      const { data } = await api.get<HistoryResponse>("/history", {
        params: {
          from: params.from,
          to: params.to,
          granularity: params.granularity ?? "hour",
          meter: params.meter ?? "total",
        },
      });
      return data;
    },
    staleTime: Infinity,
  });
}

export function useHistory(params: HistoryParams = {}) {
  return useQuery(historyQueryOptions(params));
}

// ---------------------------------------------------------------------------
// POST /api/recommend — mutation (user-triggered)
// ---------------------------------------------------------------------------

export function useRecommendations(constraints?: RecommendRequest) {
  return useMutation<RecommendResponse, Error, RecommendRequest | undefined>({
    mutationFn: async (req) => {
      const body = req ?? constraints ?? {};
      const { data } = await api.post<RecommendResponse>("/recommend", body);
      return data;
    },
  });
}

// GET /api/recommend — default recommendations (query)
export function useDefaultRecommendations() {
  return useQuery<RecommendResponse>({
    queryKey: ["recommend", "default"],
    queryFn: async () => (await api.get<RecommendResponse>("/recommend")).data,
    staleTime: 5 * 60_000,
  });
}

// ---------------------------------------------------------------------------
// GET /api/explain — 5min stale
// ---------------------------------------------------------------------------

export function explainQueryOptions(params: ExplainParams = {}) {
  return queryOptions<ExplainResponse>({
    queryKey: ["explain", params],
    queryFn: async () => {
      const { data } = await api.get<ExplainResponse>("/explain", {
        params: {
          hour: params.hour ?? 0,
          origin: params.origin ?? undefined,
        },
      });
      return data;
    },
    staleTime: 5 * 60_000,
  });
}

export function useExplanation(params: ExplainParams = {}) {
  return useQuery(explainQueryOptions(params));
}

// ---------------------------------------------------------------------------
// POST /api/simulate — mutation, 30min cache via query key
// ---------------------------------------------------------------------------

export function useSimulation() {
  return useMutation<SimulateResponse, Error, SimulateRequest>({
    mutationFn: async (req) => {
      const { data } = await api.post<SimulateResponse>("/simulate", req);
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// POST /api/sensitivity — mutation
// ---------------------------------------------------------------------------

export function useSensitivity() {
  return useMutation<SensitivityResponse, Error, SensitivityRequest>({
    mutationFn: async (req) => {
      const { data } = await api.post<SensitivityResponse>("/sensitivity", req);
      return data;
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/backtest — immutable (Infinity stale)
// ---------------------------------------------------------------------------

export function backtestQueryOptions(params: BacktestParams = {}) {
  return queryOptions<BacktestResponse>({
    queryKey: ["backtest", params],
    queryFn: async () => {
      const { data } = await api.get<BacktestResponse>("/backtest", {
        params: {
          origin: params.origin ?? undefined,
          model_name: params.model_name ?? "xgboost",
        },
      });
      return data;
    },
    staleTime: Infinity,
  });
}

export function useBacktest(params: BacktestParams = {}) {
  return useQuery(backtestQueryOptions(params));
}

// ---------------------------------------------------------------------------
// GET /api/decompose — immutable (Infinity stale)
// ---------------------------------------------------------------------------

export function decompositionQueryOptions(params: DecompositionParams = {}) {
  return queryOptions<DecompositionResponse>({
    queryKey: ["decomposition", params],
    queryFn: async () => {
      const { data } = await api.get<DecompositionResponse>("/decompose", {
        params: {
          from: params.from,
          to: params.to,
          period: params.period ?? 24,
        },
      });
      return data;
    },
    staleTime: Infinity,
  });
}

export function useDecomposition(params: DecompositionParams = {}) {
  return useQuery(decompositionQueryOptions(params));
}

// ---------------------------------------------------------------------------
// GET /api/metrics
// ---------------------------------------------------------------------------

export function useMetrics(split: "validation" | "test" = "test") {
  return useQuery<MetricsResponse>({
    queryKey: ["metrics", split],
    queryFn: async () =>
      (await api.get<MetricsResponse>("/metrics", { params: { split } })).data,
    staleTime: Infinity,
  });
}

// ---------------------------------------------------------------------------
// POST /api/upload — dataset upload mutation
// ---------------------------------------------------------------------------

export function useUploadDataset() {
  const qc = useQueryClient();
  return useMutation<UploadResponse, Error, File>({
    mutationFn: async (file) => {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post<UploadResponse>("/upload", form, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120_000,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["forecast"] });
      qc.invalidateQueries({ queryKey: ["history"] });
      qc.invalidateQueries({ queryKey: ["status"] });
      qc.invalidateQueries({ queryKey: ["backtest"] });
      qc.invalidateQueries({ queryKey: ["metrics"] });
      qc.invalidateQueries({ queryKey: ["decomposition"] });
      qc.invalidateQueries({ queryKey: ["explain"] });
      qc.invalidateQueries({ queryKey: ["recommend"] });
    },
  });
}

// ---------------------------------------------------------------------------
// GET /api/retrain/status — poll every 2s while active
// ---------------------------------------------------------------------------

export function useRetrainStatus(enabled: boolean) {
  return useQuery<RetrainStatus>({
    queryKey: ["retrain-status"],
    queryFn: async () => (await api.get<RetrainStatus>("/retrain/status")).data,
    refetchInterval: enabled ? 2000 : false,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// POST /api/chat (SSE streaming) — handled outside React Query
// ---------------------------------------------------------------------------

export async function* streamChat(
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(
    `${api.defaults.baseURL}/chat`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") return;
        yield data;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// POST /api/chat/narrate — 2min cache
// ---------------------------------------------------------------------------

export function useNarration(context: { page: string; filters?: Record<string, unknown> }, enabled = true) {
  return useQuery<{ narrative: string }>({
    queryKey: ["narration", context],
    queryFn: async () =>
      (await api.post<{ narrative: string }>("/chat/narrate", context)).data,
    staleTime: 5 * 60_000,
    enabled,
  });
}

// ---------------------------------------------------------------------------
// POST /api/chat/suggest — 5min cache
// ---------------------------------------------------------------------------

export function useSuggestions(context: { page: string; filters?: Record<string, unknown> }) {
  return useQuery<{ suggestions: string[] }>({
    queryKey: ["suggestions", context],
    queryFn: async () =>
      (await api.post<{ suggestions: string[] }>("/chat/suggest", context)).data,
    staleTime: 5 * 60_000,
    enabled: false, // manually triggered
  });
}
