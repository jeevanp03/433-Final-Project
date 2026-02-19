import { create } from "zustand";

export type ScenarioBlockType =
  | "add_appliance"
  | "remove_appliance"
  | "shift"
  | "scale"
  | "temperature_shock"
  | "occupancy"
  | "price_change"
  | "battery_solar";

export interface ScenarioBlock {
  id: string;
  type: ScenarioBlockType;
  label: string;
  params: Record<string, number | string | boolean>;
}

export interface Scenario {
  id: string;
  name: string;
  blocks: ScenarioBlock[];
  createdAt: string;
}

export interface SimulationResults {
  scenarioId: string;
  dailyKwh: { mean: number; std: number; p5: number; p95: number };
  peakKw: { mean: number; std: number; p5: number; p95: number };
  dailyCost: { mean: number; std: number; p5: number; p95: number };
  peakRiskHours: { mean: number; std: number; p5: number; p95: number };
  paths: number[][];
  percentiles: Record<string, number[]>;
}

interface SimulationState {
  activeBlocks: ScenarioBlock[];
  savedScenarios: Scenario[];
  mcRuns: number;
  mcSeed: number | null;
  residualMethod: "block_bootstrap" | "gaussian" | "empirical";
  horizon: number;
  priceScenario: "current" | "high" | "low";
  results: SimulationResults | null;
  isRunning: boolean;

  addBlock: (block: ScenarioBlock) => void;
  removeBlock: (id: string) => void;
  updateBlock: (id: string, params: Partial<ScenarioBlock["params"]>) => void;
  clearBlocks: () => void;
  saveScenario: (name: string) => void;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  setMcRuns: (runs: number) => void;
  setMcSeed: (seed: number | null) => void;
  setResidualMethod: (method: SimulationState["residualMethod"]) => void;
  setHorizon: (horizon: number) => void;
  setPriceScenario: (scenario: SimulationState["priceScenario"]) => void;
  setResults: (results: SimulationResults | null) => void;
  setIsRunning: (running: boolean) => void;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  activeBlocks: [],
  savedScenarios: [],
  mcRuns: 200,
  mcSeed: null,
  residualMethod: "block_bootstrap",
  horizon: 24,
  priceScenario: "current",
  results: null,
  isRunning: false,

  addBlock: (block) =>
    set((s) => ({ activeBlocks: [...s.activeBlocks, block] })),
  removeBlock: (id) =>
    set((s) => ({ activeBlocks: s.activeBlocks.filter((b) => b.id !== id) })),
  updateBlock: (id, params) =>
    set((s) => ({
      activeBlocks: s.activeBlocks.map((b) =>
        b.id === id ? { ...b, params: { ...b.params, ...params } } : b,
      ),
    })),
  clearBlocks: () => set({ activeBlocks: [], results: null }),
  saveScenario: (name) => {
    const { activeBlocks, savedScenarios } = get();
    const scenario: Scenario = {
      id: crypto.randomUUID(),
      name,
      blocks: [...activeBlocks],
      createdAt: new Date().toISOString(),
    };
    set({ savedScenarios: [...savedScenarios, scenario] });
  },
  loadScenario: (id) => {
    const scenario = get().savedScenarios.find((s) => s.id === id);
    if (scenario) set({ activeBlocks: [...scenario.blocks], results: null });
  },
  deleteScenario: (id) =>
    set((s) => ({
      savedScenarios: s.savedScenarios.filter((sc) => sc.id !== id),
    })),
  setMcRuns: (mcRuns) => set({ mcRuns: Math.max(50, Math.min(1000, mcRuns)) }),
  setMcSeed: (mcSeed) => set({ mcSeed }),
  setResidualMethod: (residualMethod) => set({ residualMethod }),
  setHorizon: (horizon) => set({ horizon }),
  setPriceScenario: (priceScenario) => set({ priceScenario }),
  setResults: (results) => set({ results }),
  setIsRunning: (isRunning) => set({ isRunning }),
}));
