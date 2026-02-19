import { create } from "zustand";

export type Granularity = "minute" | "hour" | "day" | "week" | "month";
export type SubMeter =
  | "kitchen"
  | "laundry"
  | "water_heater_ac"
  | "other"
  | "total";
export type CompareMode = "none" | "previous_period" | "same_period_last_year";

export interface Annotation {
  id: string;
  timestamp: string;
  text: string;
  createdAt: string;
}

interface AnalyticsState {
  dateRange: [string, string] | null;
  granularity: Granularity;
  subMeterFilter: SubMeter[];
  compareMode: CompareMode;
  annotations: Annotation[];

  setDateRange: (range: [string, string] | null) => void;
  setGranularity: (granularity: Granularity) => void;
  toggleSubMeter: (meter: SubMeter) => void;
  setSubMeterFilter: (meters: SubMeter[]) => void;
  setCompareMode: (mode: CompareMode) => void;
  addAnnotation: (annotation: Omit<Annotation, "id" | "createdAt">) => void;
  removeAnnotation: (id: string) => void;
  clearAnnotations: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set) => ({
  dateRange: null,
  granularity: "hour",
  subMeterFilter: ["total"],
  compareMode: "none",
  annotations: [],

  setDateRange: (dateRange) => set({ dateRange }),
  setGranularity: (granularity) => set({ granularity }),
  toggleSubMeter: (meter) =>
    set((s) => {
      const has = s.subMeterFilter.includes(meter);
      if (has && s.subMeterFilter.length === 1) return s;
      return {
        subMeterFilter: has
          ? s.subMeterFilter.filter((m) => m !== meter)
          : [...s.subMeterFilter, meter],
      };
    }),
  setSubMeterFilter: (subMeterFilter) => set({ subMeterFilter }),
  setCompareMode: (compareMode) => set({ compareMode }),
  addAnnotation: (annotation) =>
    set((s) => ({
      annotations: [
        ...s.annotations,
        {
          ...annotation,
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
        },
      ],
    })),
  removeAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
    })),
  clearAnnotations: () => set({ annotations: [] }),
}));
