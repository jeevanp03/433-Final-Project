import { create } from "zustand";

export type Horizon = "6h" | "12h" | "24h" | "48h" | "7d" | "14d";
export type ModelId = "naive" | "ridge" | "xgboost";

interface ForecastState {
  origin: string | null;
  horizon: Horizon;
  selectedModels: ModelId[];
  confidence: number;
  comparisonMode: boolean;
  backtestMode: boolean;
  showTouPricing: boolean;
  showSubMeters: boolean;

  setOrigin: (origin: string | null) => void;
  setHorizon: (horizon: Horizon) => void;
  toggleModel: (model: ModelId) => void;
  setSelectedModels: (models: ModelId[]) => void;
  setConfidence: (confidence: number) => void;
  toggleComparisonMode: () => void;
  toggleBacktestMode: () => void;
  toggleTouPricing: () => void;
  toggleSubMeters: () => void;
}

export const useForecastStore = create<ForecastState>((set) => ({
  origin: null,
  horizon: "24h",
  selectedModels: ["xgboost"],
  confidence: 90,
  comparisonMode: false,
  backtestMode: false,
  showTouPricing: false,
  showSubMeters: false,

  setOrigin: (origin) => set({ origin }),
  setHorizon: (horizon) => set({ horizon }),
  toggleModel: (model) =>
    set((s) => {
      const has = s.selectedModels.includes(model);
      if (has && s.selectedModels.length === 1) return s; // keep at least one
      return {
        selectedModels: has
          ? s.selectedModels.filter((m) => m !== model)
          : [...s.selectedModels, model],
      };
    }),
  setSelectedModels: (models) => set({ selectedModels: models }),
  setConfidence: (confidence) =>
    set({ confidence: Math.max(50, Math.min(99, confidence)) }),
  toggleComparisonMode: () =>
    set((s) => ({ comparisonMode: !s.comparisonMode })),
  toggleBacktestMode: () => set((s) => ({ backtestMode: !s.backtestMode })),
  toggleTouPricing: () => set((s) => ({ showTouPricing: !s.showTouPricing })),
  toggleSubMeters: () => set((s) => ({ showSubMeters: !s.showSubMeters })),
}));
