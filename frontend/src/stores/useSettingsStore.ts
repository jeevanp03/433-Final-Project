import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";
export type DensityLevel = "glance" | "explore" | "deep_dive";
export type UnitSystem = "metric" | "imperial";
export type Currency = "EUR" | "CAD" | "USD" | "GBP" | "AUD" | "CHF";
export type Region =
  | "france"
  | "canada"
  | "us"
  | "uk"
  | "germany"
  | "australia";

export interface TouTier {
  label: string;
  startHour: number;
  endHour: number;
  rate: number;
}

export interface Appliance {
  id: string;
  name: string;
  icon: string;
  powerKw: number;
  durationHours: number;
  allowedWindow: [number, number];
  preemptable: boolean;
}

export type ForecastHorizon = "24h" | "48h" | "7d";

interface SettingsState {
  // Onboarding
  onboardingComplete: boolean;

  // Display
  theme: Theme;
  density: DensityLevel;
  defaultHorizon: ForecastHorizon;

  // Regional
  region: Region;
  unitSystem: UnitSystem;
  currency: Currency;
  exchangeRate: number;

  // Pricing
  touSchedule: TouTier[];

  // Household
  householdType: string;
  occupants: number;
  floorArea: number;
  climateZone: string;

  // Appliance registry
  appliances: Appliance[];

  // Notifications
  peakAlertEnabled: boolean;
  budgetAlertEnabled: boolean;
  budgetLimit: number;

  // LLM
  llmModel: string;
  narrationMode: "auto" | "manual" | "off";
  llmTemperature: number;
  maxToolCalls: number;
  ollamaUrl: string;

  // Actions
  completeOnboarding: () => void;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setDensity: (density: DensityLevel) => void;
  setDefaultHorizon: (horizon: ForecastHorizon) => void;
  setRegion: (region: Region) => void;
  setUnitSystem: (system: UnitSystem) => void;
  setCurrency: (currency: Currency) => void;
  setExchangeRate: (rate: number) => void;
  setTouSchedule: (schedule: TouTier[]) => void;
  setHouseholdType: (type: string) => void;
  setOccupants: (n: number) => void;
  setFloorArea: (area: number) => void;
  setClimateZone: (zone: string) => void;
  addAppliance: (appliance: Appliance) => void;
  removeAppliance: (id: string) => void;
  updateAppliance: (id: string, updates: Partial<Appliance>) => void;
  setPeakAlertEnabled: (enabled: boolean) => void;
  setBudgetAlertEnabled: (enabled: boolean) => void;
  setBudgetLimit: (limit: number) => void;
  setLlmModel: (model: string) => void;
  setNarrationMode: (mode: SettingsState["narrationMode"]) => void;
  setLlmTemperature: (temp: number) => void;
  setMaxToolCalls: (n: number) => void;
  setOllamaUrl: (url: string) => void;
  resetAll: () => void;
}

const DEFAULT_TOU: TouTier[] = [
  { label: "Off-Peak", startHour: 22, endHour: 6, rate: 0.1296 },
  { label: "Mid-Peak", startHour: 6, endHour: 7, rate: 0.1593 },
  { label: "On-Peak", startHour: 7, endHour: 22, rate: 0.1593 },
];

const DEFAULT_APPLIANCES: Appliance[] = [
  {
    id: "dishwasher",
    name: "Dishwasher",
    icon: "utensils",
    powerKw: 1.8,
    durationHours: 1.5,
    allowedWindow: [0, 24],
    preemptable: false,
  },
  {
    id: "washing_machine",
    name: "Washing Machine",
    icon: "shirt",
    powerKw: 2.0,
    durationHours: 1.0,
    allowedWindow: [0, 24],
    preemptable: false,
  },
  {
    id: "dryer",
    name: "Dryer",
    icon: "wind",
    powerKw: 2.5,
    durationHours: 1.5,
    allowedWindow: [0, 24],
    preemptable: false,
  },
  {
    id: "ev_charger",
    name: "EV Charger",
    icon: "plug-zap",
    powerKw: 7.0,
    durationHours: 4.0,
    allowedWindow: [22, 6],
    preemptable: true,
  },
];

const DEFAULTS: Omit<SettingsState, keyof SettingsActions> = {
  onboardingComplete: false,
  theme: "light",
  density: "explore",
  defaultHorizon: "24h",
  region: "canada",
  unitSystem: "metric",
  currency: "CAD",
  exchangeRate: 1.5,
  touSchedule: DEFAULT_TOU,
  householdType: "house",
  occupants: 4,
  floorArea: 120,
  climateZone: "temperate",
  appliances: DEFAULT_APPLIANCES,
  peakAlertEnabled: true,
  budgetAlertEnabled: false,
  budgetLimit: 5.0,
  llmModel: import.meta.env.VITE_OLLAMA_MODEL || "deepseek-r1:1.5b",
  narrationMode: "auto",
  llmTemperature: 0.3,
  maxToolCalls: 3,
  ollamaUrl: import.meta.env.VITE_OLLAMA_URL || "http://localhost:11434",
};

// Action keys for partialize
type SettingsActions = {
  completeOnboarding: () => void;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setDensity: (density: DensityLevel) => void;
  setDefaultHorizon: (horizon: ForecastHorizon) => void;
  setRegion: (region: Region) => void;
  setUnitSystem: (system: UnitSystem) => void;
  setCurrency: (currency: Currency) => void;
  setExchangeRate: (rate: number) => void;
  setTouSchedule: (schedule: TouTier[]) => void;
  setHouseholdType: (type: string) => void;
  setOccupants: (n: number) => void;
  setFloorArea: (area: number) => void;
  setClimateZone: (zone: string) => void;
  addAppliance: (appliance: Appliance) => void;
  removeAppliance: (id: string) => void;
  updateAppliance: (id: string, updates: Partial<Appliance>) => void;
  setPeakAlertEnabled: (enabled: boolean) => void;
  setBudgetAlertEnabled: (enabled: boolean) => void;
  setBudgetLimit: (limit: number) => void;
  setLlmModel: (model: string) => void;
  setNarrationMode: (mode: SettingsState["narrationMode"]) => void;
  setLlmTemperature: (temp: number) => void;
  setMaxToolCalls: (n: number) => void;
  setOllamaUrl: (url: string) => void;
  resetAll: () => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      completeOnboarding: () => set({ onboardingComplete: true }),
      toggleTheme: () =>
        set((state) => {
          const next = state.theme === "dark" ? "light" : "dark";
          applyTheme(next);
          return { theme: next };
        }),
      setTheme: (theme: Theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setDensity: (density) => set({ density }),
      setDefaultHorizon: (defaultHorizon) => set({ defaultHorizon }),
      setRegion: (region) => set({ region }),
      setUnitSystem: (unitSystem) => set({ unitSystem }),
      setCurrency: (currency) => set({ currency }),
      setExchangeRate: (exchangeRate) => set({ exchangeRate }),
      setTouSchedule: (touSchedule) => set({ touSchedule }),
      setHouseholdType: (householdType) => set({ householdType }),
      setOccupants: (occupants) => set({ occupants }),
      setFloorArea: (floorArea) => set({ floorArea }),
      setClimateZone: (climateZone) => set({ climateZone }),
      addAppliance: (appliance) =>
        set((s) => ({ appliances: [...s.appliances, appliance] })),
      removeAppliance: (id) =>
        set((s) => ({
          appliances: s.appliances.filter((a) => a.id !== id),
        })),
      updateAppliance: (id, updates) =>
        set((s) => ({
          appliances: s.appliances.map((a) =>
            a.id === id ? { ...a, ...updates } : a,
          ),
        })),
      setPeakAlertEnabled: (peakAlertEnabled) => set({ peakAlertEnabled }),
      setBudgetAlertEnabled: (budgetAlertEnabled) =>
        set({ budgetAlertEnabled }),
      setBudgetLimit: (budgetLimit) => set({ budgetLimit }),
      setLlmModel: (llmModel) => set({ llmModel }),
      setNarrationMode: (narrationMode) => set({ narrationMode }),
      setLlmTemperature: (llmTemperature) => set({ llmTemperature }),
      setMaxToolCalls: (maxToolCalls) => set({ maxToolCalls }),
      setOllamaUrl: (ollamaUrl) => set({ ollamaUrl }),
      resetAll: () => set(DEFAULTS),
    }),
    { name: "energy-idss-settings" },
  ),
);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else if (theme === "light") {
    root.classList.remove("dark");
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }
}
