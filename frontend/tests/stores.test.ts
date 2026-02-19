import { describe, it, expect, beforeEach } from "vitest";
import { useForecastStore } from "@/stores/useForecastStore";
import { useUIStore } from "@/stores/useUIStore";
import { useChatStore } from "@/stores/useChatStore";
import { useRecommendationStore } from "@/stores/useRecommendationStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useSimulationStore } from "@/stores/useSimulationStore";
import { useAnalyticsStore } from "@/stores/useAnalyticsStore";
import type { Recommendation } from "@/stores/useRecommendationStore";
import type { ScenarioBlock } from "@/stores/useSimulationStore";

// ---------------------------------------------------------------------------
// useForecastStore
// ---------------------------------------------------------------------------
describe("useForecastStore", () => {
  beforeEach(() => useForecastStore.setState(useForecastStore.getInitialState()));

  it("has correct defaults", () => {
    const s = useForecastStore.getState();
    expect(s.horizon).toBe("24h");
    expect(s.selectedModels).toEqual(["xgboost"]);
    expect(s.confidence).toBe(90);
    expect(s.origin).toBeNull();
  });

  it("toggleModel adds and removes models", () => {
    const { toggleModel } = useForecastStore.getState();
    toggleModel("ridge");
    expect(useForecastStore.getState().selectedModels).toEqual(["xgboost", "ridge"]);
    toggleModel("xgboost");
    expect(useForecastStore.getState().selectedModels).toEqual(["ridge"]);
  });

  it("toggleModel cannot remove the last model", () => {
    const { toggleModel } = useForecastStore.getState();
    toggleModel("xgboost"); // try to remove only model
    expect(useForecastStore.getState().selectedModels).toEqual(["xgboost"]);
  });

  it("setConfidence clamps to [50, 99]", () => {
    const { setConfidence } = useForecastStore.getState();
    setConfidence(20);
    expect(useForecastStore.getState().confidence).toBe(50);
    setConfidence(120);
    expect(useForecastStore.getState().confidence).toBe(99);
    setConfidence(80);
    expect(useForecastStore.getState().confidence).toBe(80);
  });

  it("toggles backtest mode", () => {
    const { toggleBacktestMode } = useForecastStore.getState();
    expect(useForecastStore.getState().backtestMode).toBe(false);
    toggleBacktestMode();
    expect(useForecastStore.getState().backtestMode).toBe(true);
    toggleBacktestMode();
    expect(useForecastStore.getState().backtestMode).toBe(false);
  });

  it("sets horizon", () => {
    useForecastStore.getState().setHorizon("7d");
    expect(useForecastStore.getState().horizon).toBe("7d");
  });
});

// ---------------------------------------------------------------------------
// useUIStore
// ---------------------------------------------------------------------------
describe("useUIStore", () => {
  beforeEach(() => useUIStore.setState(useUIStore.getInitialState()));

  it("has correct defaults", () => {
    const s = useUIStore.getState();
    expect(s.sidebarCollapsed).toBe(false);
    expect(s.density).toBe("explore");
    expect(s.activeModal).toBeNull();
    expect(s.toasts).toEqual([]);
    expect(s.commandPaletteOpen).toBe(false);
  });

  it("toggleSidebar flips state", () => {
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(true);
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });

  it("addToast appends with auto id", () => {
    useUIStore.getState().addToast({ type: "success", title: "Done" });
    const toasts = useUIStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe("Done");
    expect(toasts[0].type).toBe("success");
    expect(toasts[0].id).toBeTruthy();
  });

  it("dismissToast removes by id", () => {
    useUIStore.getState().addToast({ type: "error", title: "Oops" });
    const id = useUIStore.getState().toasts[0].id;
    useUIStore.getState().dismissToast(id);
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it("loadingKeys tracks as a Set", () => {
    const store = useUIStore.getState();
    store.setLoading("forecast", true);
    expect(useUIStore.getState().loadingKeys.has("forecast")).toBe(true);
    expect(useUIStore.getState().isLoading("forecast")).toBe(true);
    store.setLoading("forecast", false);
    expect(useUIStore.getState().isLoading("forecast")).toBe(false);
  });

  it("openModal and closeModal work", () => {
    useUIStore.getState().openModal("confirm-delete");
    expect(useUIStore.getState().activeModal).toBe("confirm-delete");
    useUIStore.getState().closeModal();
    expect(useUIStore.getState().activeModal).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useChatStore
// ---------------------------------------------------------------------------
describe("useChatStore", () => {
  beforeEach(() => useChatStore.setState(useChatStore.getInitialState()));

  it("has correct defaults", () => {
    const s = useChatStore.getState();
    expect(s.messages).toEqual([]);
    expect(s.isStreaming).toBe(false);
    expect(s.streamingContent).toBe("");
    expect(s.drawerOpen).toBe(false);
    expect(s.persona).toBe("analyst");
    expect(s.error).toBeNull();
  });

  it("addMessage generates id and timestamp", () => {
    useChatStore.getState().addMessage({ role: "user", content: "hello" });
    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(1);
    expect(msgs[0].role).toBe("user");
    expect(msgs[0].content).toBe("hello");
    expect(msgs[0].id).toBeTruthy();
    expect(msgs[0].timestamp).toBeTruthy();
  });

  it("appendStreamChunk concatenates", () => {
    useChatStore.getState().appendStreamChunk("Hello ");
    useChatStore.getState().appendStreamChunk("world");
    expect(useChatStore.getState().streamingContent).toBe("Hello world");
  });

  it("finaliseStream promotes content to message and resets", () => {
    useChatStore.getState().appendStreamChunk("response text");
    useChatStore.getState().finaliseStream();

    const s = useChatStore.getState();
    expect(s.messages).toHaveLength(1);
    expect(s.messages[0].role).toBe("assistant");
    expect(s.messages[0].content).toBe("response text");
    expect(s.streamingContent).toBe("");
    expect(s.isStreaming).toBe(false);
  });

  it("finaliseStream does nothing when streamingContent is empty", () => {
    useChatStore.getState().finaliseStream();
    expect(useChatStore.getState().messages).toHaveLength(0);
  });

  it("toggleDrawer flips open state", () => {
    useChatStore.getState().toggleDrawer();
    expect(useChatStore.getState().drawerOpen).toBe(true);
    useChatStore.getState().toggleDrawer();
    expect(useChatStore.getState().drawerOpen).toBe(false);
  });

  it("clearMessages resets messages and error", () => {
    useChatStore.getState().addMessage({ role: "user", content: "hi" });
    useChatStore.getState().setError("boom");
    useChatStore.getState().clearMessages();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().error).toBeNull();
  });

  it("updateMessage modifies specific message by id", () => {
    useChatStore.getState().addMessage({ role: "user", content: "original" });
    const id = useChatStore.getState().messages[0].id;
    useChatStore.getState().updateMessage(id, { content: "edited" });
    expect(useChatStore.getState().messages[0].content).toBe("edited");
  });
});

// ---------------------------------------------------------------------------
// useRecommendationStore
// ---------------------------------------------------------------------------
describe("useRecommendationStore", () => {
  const mockReco: Recommendation = {
    id: "reco-1",
    appliance: "Dishwasher",
    applianceIcon: "utensils",
    shiftFrom: "12:00-13:30",
    shiftTo: "02:00-03:30",
    savingsKwh: 1.2,
    savingsCost: 0.18,
    peakReduction: 5.3,
    urgency: "high",
    explanation: "Shifting reduces peak",
    status: "pending",
    createdAt: "2026-02-19T10:00:00Z",
  };

  beforeEach(() =>
    useRecommendationStore.setState({
      queue: [{ ...mockReco }],
      schedule: [],
      impactLog: [],
    }),
  );

  it("acceptReco sets status to accepted with timestamp", () => {
    useRecommendationStore.getState().acceptReco("reco-1");
    const r = useRecommendationStore.getState().queue[0];
    expect(r.status).toBe("accepted");
    expect(r.respondedAt).toBeTruthy();
  });

  it("rejectReco sets status to rejected", () => {
    useRecommendationStore.getState().rejectReco("reco-1");
    expect(useRecommendationStore.getState().queue[0].status).toBe("rejected");
  });

  it("snoozeReco sets status to snoozed", () => {
    useRecommendationStore.getState().snoozeReco("reco-1");
    expect(useRecommendationStore.getState().queue[0].status).toBe("snoozed");
  });

  it("resetReco sets back to pending and clears respondedAt", () => {
    useRecommendationStore.getState().acceptReco("reco-1");
    useRecommendationStore.getState().resetReco("reco-1");
    const r = useRecommendationStore.getState().queue[0];
    expect(r.status).toBe("pending");
    expect(r.respondedAt).toBeUndefined();
  });

  it("addImpactEntry appends to log", () => {
    useRecommendationStore.getState().addImpactEntry({
      recoId: "reco-1",
      appliance: "Dishwasher",
      predictedSavings: 0.18,
      actualSavings: 0.15,
      date: "2026-02-19",
    });
    expect(useRecommendationStore.getState().impactLog).toHaveLength(1);
  });

  it("clearHistory empties impact log", () => {
    useRecommendationStore.getState().addImpactEntry({
      recoId: "reco-1",
      appliance: "Dishwasher",
      predictedSavings: 0.18,
      actualSavings: null,
      date: "2026-02-19",
    });
    useRecommendationStore.getState().clearHistory();
    expect(useRecommendationStore.getState().impactLog).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// useSettingsStore
// ---------------------------------------------------------------------------
describe("useSettingsStore", () => {
  beforeEach(() => useSettingsStore.getState().resetAll());

  it("has correct defaults", () => {
    const s = useSettingsStore.getState();
    expect(s.theme).toBe("light");
    expect(s.region).toBe("canada");
    expect(s.currency).toBe("CAD");
    expect(s.occupants).toBe(4);
    expect(s.floorArea).toBe(120);
    expect(s.llmModel).toBe(import.meta.env.VITE_OLLAMA_MODEL || "deepseek-r1:1.5b");
    expect(s.narrationMode).toBe("auto");
    expect(s.appliances).toHaveLength(4);
  });

  it("toggleTheme switches between light and dark", () => {
    useSettingsStore.getState().toggleTheme();
    expect(useSettingsStore.getState().theme).toBe("dark");
    useSettingsStore.getState().toggleTheme();
    expect(useSettingsStore.getState().theme).toBe("light");
  });

  it("setTheme applies dark class to document", () => {
    useSettingsStore.getState().setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    useSettingsStore.getState().setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("addAppliance and removeAppliance work", () => {
    const newApp = {
      id: "pool_pump",
      name: "Pool Pump",
      icon: "droplet",
      powerKw: 1.5,
      durationHours: 2,
      allowedWindow: [0, 24] as [number, number],
      preemptable: false,
    };
    useSettingsStore.getState().addAppliance(newApp);
    expect(useSettingsStore.getState().appliances).toHaveLength(5);
    useSettingsStore.getState().removeAppliance("pool_pump");
    expect(useSettingsStore.getState().appliances).toHaveLength(4);
  });

  it("updateAppliance modifies specific appliance", () => {
    useSettingsStore.getState().updateAppliance("dishwasher", { powerKw: 2.0 });
    const dw = useSettingsStore.getState().appliances.find((a) => a.id === "dishwasher");
    expect(dw?.powerKw).toBe(2.0);
  });

  it("resetAll restores defaults", () => {
    useSettingsStore.getState().setCurrency("USD");
    useSettingsStore.getState().setOccupants(2);
    useSettingsStore.getState().resetAll();
    expect(useSettingsStore.getState().currency).toBe("CAD");
    expect(useSettingsStore.getState().occupants).toBe(4);
  });

  it("setRegion and setCurrency work", () => {
    useSettingsStore.getState().setRegion("canada");
    useSettingsStore.getState().setCurrency("CAD");
    expect(useSettingsStore.getState().region).toBe("canada");
    expect(useSettingsStore.getState().currency).toBe("CAD");
  });
});

// ---------------------------------------------------------------------------
// useSimulationStore
// ---------------------------------------------------------------------------
describe("useSimulationStore", () => {
  beforeEach(() => useSimulationStore.setState(useSimulationStore.getInitialState()));

  const block: ScenarioBlock = {
    id: "b1",
    type: "add_appliance",
    label: "Add EV Charger",
    params: { power_kw: 7.0, duration_h: 4 },
  };

  it("has correct defaults", () => {
    const s = useSimulationStore.getState();
    expect(s.activeBlocks).toEqual([]);
    expect(s.mcRuns).toBe(200);
    expect(s.residualMethod).toBe("block_bootstrap");
    expect(s.horizon).toBe(24);
    expect(s.results).toBeNull();
  });

  it("addBlock and removeBlock work", () => {
    useSimulationStore.getState().addBlock(block);
    expect(useSimulationStore.getState().activeBlocks).toHaveLength(1);
    useSimulationStore.getState().removeBlock("b1");
    expect(useSimulationStore.getState().activeBlocks).toHaveLength(0);
  });

  it("clearBlocks also clears results", () => {
    useSimulationStore.getState().addBlock(block);
    useSimulationStore.getState().setResults({
      scenarioId: "s1",
      dailyKwh: { mean: 10, std: 1, p5: 8, p95: 12 },
      peakKw: { mean: 3, std: 0.5, p5: 2, p95: 4 },
      dailyCost: { mean: 2, std: 0.3, p5: 1.5, p95: 2.5 },
      peakRiskHours: { mean: 4, std: 1, p5: 2, p95: 6 },
      paths: [],
      percentiles: {},
    });
    useSimulationStore.getState().clearBlocks();
    expect(useSimulationStore.getState().activeBlocks).toEqual([]);
    expect(useSimulationStore.getState().results).toBeNull();
  });

  it("setMcRuns clamps to [50, 1000]", () => {
    useSimulationStore.getState().setMcRuns(10);
    expect(useSimulationStore.getState().mcRuns).toBe(50);
    useSimulationStore.getState().setMcRuns(2000);
    expect(useSimulationStore.getState().mcRuns).toBe(1000);
    useSimulationStore.getState().setMcRuns(500);
    expect(useSimulationStore.getState().mcRuns).toBe(500);
  });

  it("saveScenario copies blocks by value", () => {
    useSimulationStore.getState().addBlock(block);
    useSimulationStore.getState().saveScenario("Test Scenario");
    const saved = useSimulationStore.getState().savedScenarios;
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Test Scenario");
    expect(saved[0].blocks).toEqual([block]);
    // Verify copy by value (not reference)
    expect(saved[0].blocks).not.toBe(useSimulationStore.getState().activeBlocks);
  });

  it("loadScenario restores blocks and clears results", () => {
    useSimulationStore.getState().addBlock(block);
    useSimulationStore.getState().saveScenario("S1");
    const scenarioId = useSimulationStore.getState().savedScenarios[0].id;
    useSimulationStore.getState().clearBlocks();
    useSimulationStore.getState().loadScenario(scenarioId);
    expect(useSimulationStore.getState().activeBlocks).toHaveLength(1);
    expect(useSimulationStore.getState().results).toBeNull();
  });

  it("deleteScenario removes by id", () => {
    useSimulationStore.getState().saveScenario("ToDelete");
    const id = useSimulationStore.getState().savedScenarios[0].id;
    useSimulationStore.getState().deleteScenario(id);
    expect(useSimulationStore.getState().savedScenarios).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// useAnalyticsStore
// ---------------------------------------------------------------------------
describe("useAnalyticsStore", () => {
  beforeEach(() => useAnalyticsStore.setState(useAnalyticsStore.getInitialState()));

  it("has correct defaults", () => {
    const s = useAnalyticsStore.getState();
    expect(s.granularity).toBe("hour");
    expect(s.subMeterFilter).toEqual(["total"]);
    expect(s.compareMode).toBe("none");
    expect(s.annotations).toEqual([]);
    expect(s.dateRange).toBeNull();
  });

  it("toggleSubMeter adds and removes meters", () => {
    useAnalyticsStore.getState().toggleSubMeter("kitchen");
    expect(useAnalyticsStore.getState().subMeterFilter).toEqual(["total", "kitchen"]);
    useAnalyticsStore.getState().toggleSubMeter("total");
    expect(useAnalyticsStore.getState().subMeterFilter).toEqual(["kitchen"]);
  });

  it("toggleSubMeter cannot remove the last meter", () => {
    useAnalyticsStore.getState().toggleSubMeter("total"); // try to remove only meter
    expect(useAnalyticsStore.getState().subMeterFilter).toEqual(["total"]);
  });

  it("addAnnotation generates id and createdAt", () => {
    useAnalyticsStore.getState().addAnnotation({ timestamp: "2026-02-19T12:00:00Z", text: "Peak event" });
    const anns = useAnalyticsStore.getState().annotations;
    expect(anns).toHaveLength(1);
    expect(anns[0].text).toBe("Peak event");
    expect(anns[0].id).toBeTruthy();
    expect(anns[0].createdAt).toBeTruthy();
  });

  it("removeAnnotation and clearAnnotations work", () => {
    useAnalyticsStore.getState().addAnnotation({ timestamp: "2026-02-19T12:00:00Z", text: "Note 1" });
    useAnalyticsStore.getState().addAnnotation({ timestamp: "2026-02-19T13:00:00Z", text: "Note 2" });
    const id = useAnalyticsStore.getState().annotations[0].id;
    useAnalyticsStore.getState().removeAnnotation(id);
    expect(useAnalyticsStore.getState().annotations).toHaveLength(1);
    useAnalyticsStore.getState().clearAnnotations();
    expect(useAnalyticsStore.getState().annotations).toEqual([]);
  });

  it("setGranularity and setCompareMode work", () => {
    useAnalyticsStore.getState().setGranularity("month");
    expect(useAnalyticsStore.getState().granularity).toBe("month");
    useAnalyticsStore.getState().setCompareMode("previous_period");
    expect(useAnalyticsStore.getState().compareMode).toBe("previous_period");
  });
});
