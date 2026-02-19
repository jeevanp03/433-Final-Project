import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RecoStatus = "pending" | "accepted" | "rejected" | "snoozed";

export interface Recommendation {
  id: string;
  appliance: string;
  applianceIcon: string;
  shiftFrom: string;
  shiftTo: string;
  savingsKwh: number;
  savingsCost: number;
  peakReduction: number;
  urgency: "high" | "medium" | "low";
  explanation: string;
  status: RecoStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface ScheduleBlock {
  id: string;
  appliance: string;
  startHour: number;
  endHour: number;
  powerKw: number;
  isFlexible: boolean;
  allowedWindow: [number, number];
}

export interface ImpactLogEntry {
  recoId: string;
  appliance: string;
  predictedSavings: number;
  actualSavings: number | null;
  date: string;
}

interface RecommendationState {
  queue: Recommendation[];
  schedule: ScheduleBlock[];
  impactLog: ImpactLogEntry[];

  setQueue: (queue: Recommendation[]) => void;
  acceptReco: (id: string) => void;
  rejectReco: (id: string) => void;
  snoozeReco: (id: string) => void;
  resetReco: (id: string) => void;
  setSchedule: (schedule: ScheduleBlock[]) => void;
  updateScheduleBlock: (
    id: string,
    updates: Partial<ScheduleBlock>,
  ) => void;
  addImpactEntry: (entry: ImpactLogEntry) => void;
  clearHistory: () => void;
}

export const useRecommendationStore = create<RecommendationState>()(
  persist(
    (set) => ({
      queue: [],
      schedule: [],
      impactLog: [],

      setQueue: (queue) => set({ queue }),
      acceptReco: (id) =>
        set((s) => ({
          queue: s.queue.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "accepted" as const,
                  respondedAt: new Date().toISOString(),
                }
              : r,
          ),
        })),
      rejectReco: (id) =>
        set((s) => ({
          queue: s.queue.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "rejected" as const,
                  respondedAt: new Date().toISOString(),
                }
              : r,
          ),
        })),
      snoozeReco: (id) =>
        set((s) => ({
          queue: s.queue.map((r) =>
            r.id === id
              ? {
                  ...r,
                  status: "snoozed" as const,
                  respondedAt: new Date().toISOString(),
                }
              : r,
          ),
        })),
      resetReco: (id) =>
        set((s) => ({
          queue: s.queue.map((r) =>
            r.id === id
              ? { ...r, status: "pending" as const, respondedAt: undefined }
              : r,
          ),
        })),
      setSchedule: (schedule) => set({ schedule }),
      updateScheduleBlock: (id, updates) =>
        set((s) => ({
          schedule: s.schedule.map((b) =>
            b.id === id ? { ...b, ...updates } : b,
          ),
        })),
      addImpactEntry: (entry) =>
        set((s) => ({ impactLog: [...s.impactLog, entry] })),
      clearHistory: () => set({ impactLog: [] }),
    }),
    {
      name: "energy-idss-recommendations",
      partialize: (state) => ({
        impactLog: state.impactLog,
      }),
    },
  ),
);
