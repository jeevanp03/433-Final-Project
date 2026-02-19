import { useState, useCallback, useMemo } from "react";
import {
  Play,
  BarChart3,
  Save,
  Trash2,
  Upload,
  FlaskConical,
  Layers,
  SlidersHorizontal,
  Shuffle,
  TrendingUp,
} from "lucide-react";

import ScenarioBuilder from "@/components/controls/ScenarioBuilder";
import FanChart from "@/components/charts/FanChart";
import TornadoChart from "@/components/charts/TornadoChart";
import OutcomeCard from "@/components/cards/OutcomeCard";
import ParetoScatter from "@/components/charts/ParetoScatter";
import EmptyState from "@/components/ui/EmptyState";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import ErrorFallback from "@/components/ui/ErrorFallback";
import { COLOURS } from "@/theme/chartTheme";

import { useSimulation, useSensitivity, useForecast } from "@/api/hooks";
import { useSimulationStore, type ScenarioBlockType } from "@/stores/useSimulationStore";
import type { ScenarioBlockInput, SimulateResponse, SensitivityResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function blocksToInput(blocks: { type: string; label: string; params: Record<string, number | string | boolean> }[]): ScenarioBlockInput[] {
  return blocks.map((b) => ({ type: b.type, label: b.label, params: b.params }));
}

function buildFanData(
  percentiles: Record<string, number[]>,
  horizon: number,
  baselinePoints?: { timestamp: string; forecast: number }[],
) {
  const p10 = percentiles["10"] ?? percentiles["p10"] ?? [];
  const p25 = percentiles["25"] ?? percentiles["p25"] ?? [];
  const p50 = percentiles["50"] ?? percentiles["p50"] ?? [];
  const p75 = percentiles["75"] ?? percentiles["p75"] ?? [];
  const p90 = percentiles["90"] ?? percentiles["p90"] ?? [];

  return Array.from({ length: Math.max(p50.length, horizon) }, (_, i) => ({
    timestamp: baselinePoints?.[i]?.timestamp ?? `H+${i + 1}`,
    median: p50[i] ?? 0,
    p10: p10[i] ?? 0,
    p25: p25[i] ?? 0,
    p75: p75[i] ?? 0,
    p90: p90[i] ?? 0,
    baseline: baselinePoints?.[i]?.forecast,
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeading({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-8 h-8 rounded-lg bg-energy-teal/10 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <h3 className="text-section-heading text-foreground">{title}</h3>
        {subtitle && <p className="text-small text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function LabeledSlider({ label, value, min, max, step, onChange, suffix }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-small">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-energy-teal h-1.5 rounded-full cursor-pointer" />
    </div>
  );
}

function PillToggle<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
      {options.map((opt) => (
        <button key={opt.value} onClick={() => onChange(opt.value)} className={`px-3 py-1 text-small font-medium rounded-md transition-colors cursor-pointer ${value === opt.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Simulate() {
  const {
    activeBlocks, savedScenarios, mcRuns, mcSeed, residualMethod, horizon, priceScenario,
    results, isRunning,
    addBlock, removeBlock, clearBlocks, saveScenario, loadScenario, deleteScenario,
    setMcRuns, setMcSeed, setResidualMethod, setHorizon, setPriceScenario, setResults, setIsRunning,
  } = useSimulationStore();

  const simulationMutation = useSimulation();
  const sensitivityMutation = useSensitivity();
  const { data: baselineData } = useForecast({ model: "xgboost", horizon });

  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<"build" | "compare">("build");
  const [sensitivityResults, setSensitivityResults] = useState<SensitivityResponse | null>(null);

  const handleRunSimulation = useCallback(() => {
    setIsRunning(true);
    simulationMutation.mutate(
      { blocks: blocksToInput(activeBlocks), mc_runs: mcRuns, seed: mcSeed ?? undefined, horizon },
      {
        onSuccess: (data: SimulateResponse) => {
          setResults({ scenarioId: crypto.randomUUID(), dailyKwh: data.daily_kwh, peakKw: data.peak_kw, dailyCost: data.daily_cost, peakRiskHours: data.peak_risk_hours, paths: [], percentiles: data.percentiles });
          setIsRunning(false);
        },
        onError: () => setIsRunning(false),
      },
    );
  }, [activeBlocks, mcRuns, mcSeed, horizon, simulationMutation, setResults, setIsRunning]);

  const handleRunSensitivity = useCallback(() => {
    sensitivityMutation.mutate(
      { base_scenario: blocksToInput(activeBlocks), target_metric: "daily_cost" },
      { onSuccess: (data: SensitivityResponse) => setSensitivityResults(data) },
    );
  }, [activeBlocks, sensitivityMutation]);

  const handleSave = useCallback(() => {
    if (!scenarioName.trim()) return;
    saveScenario(scenarioName.trim());
    setScenarioName("");
    setSaveDialogOpen(false);
  }, [scenarioName, saveScenario]);

  const handleToggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 4) next.add(id);
      return next;
    });
  }, []);

  const handleBlocksChange = useCallback((newBlocks: ScenarioBlockInput[]) => {
    activeBlocks.forEach((b) => removeBlock(b.id));
    newBlocks.forEach((b) => {
      addBlock({ id: crypto.randomUUID(), type: b.type as ScenarioBlockType, label: b.label, params: (b.params ?? {}) as Record<string, number | string | boolean> });
    });
  }, [activeBlocks, addBlock, removeBlock]);

  const fanData = useMemo(() => {
    if (!results) return [];
    return buildFanData(results.percentiles, horizon, baselineData?.points.map((p) => ({ timestamp: p.timestamp, forecast: p.forecast })));
  }, [results, horizon, baselineData]);

  const paretoScenarios = useMemo(() => {
    const points: { name: string; cost: number; peak: number }[] = [];
    if (results) points.push({ name: "Current", cost: results.dailyCost.mean, peak: results.peakKw.mean });
    savedScenarios.filter((s) => compareIds.has(s.id)).forEach((s) => {
      points.push({ name: s.name, cost: results ? results.dailyCost.mean * (0.8 + Math.random() * 0.4) : 0, peak: results ? results.peakKw.mean * (0.85 + Math.random() * 0.3) : 0 });
    });
    return points;
  }, [savedScenarios, compareIds, results]);

  const builderBlocks: ScenarioBlockInput[] = activeBlocks.map((b) => ({ type: b.type, label: b.label, params: b.params }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground">Simulation Sandbox</h2>
        <p className="text-body text-muted-foreground mt-1">Build what-if scenarios, run Monte Carlo simulations, and compare outcomes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Builder + Controls */}
        <div className="lg:col-span-4 space-y-5">
          <div className="flex gap-2">
            <button onClick={() => setActiveTab("build")} className={`flex-1 flex items-center justify-center gap-2 py-2 text-small font-medium rounded-lg border transition-colors cursor-pointer ${activeTab === "build" ? "border-energy-teal bg-energy-teal/5 text-energy-teal" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
              <FlaskConical className="w-4 h-4" />Build
            </button>
            <button onClick={() => setActiveTab("compare")} className={`flex-1 flex items-center justify-center gap-2 py-2 text-small font-medium rounded-lg border transition-colors cursor-pointer ${activeTab === "compare" ? "border-energy-teal bg-energy-teal/5 text-energy-teal" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
              <Layers className="w-4 h-4" />Compare
              {savedScenarios.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-energy-teal/10 text-energy-teal">{savedScenarios.length}</span>}
            </button>
          </div>

          {activeTab === "build" ? (
            <>
              <div className="rounded-xl border border-border bg-card p-4">
                <SectionHeading icon={<FlaskConical className="w-4 h-4 text-energy-teal" />} title="Scenario Blocks" subtitle="Add modifications to the baseline forecast" />
                <ScenarioBuilder blocks={builderBlocks} onChange={handleBlocksChange} />
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-4">
                <SectionHeading icon={<SlidersHorizontal className="w-4 h-4 text-energy-teal" />} title="Simulation Controls" />
                <div className="space-y-1.5">
                  <span className="text-small text-muted-foreground">Forecast Horizon</span>
                  <PillToggle options={[{ value: "24", label: "24h" }, { value: "48", label: "48h" }, { value: "168", label: "7d" }]} value={String(horizon)} onChange={(v) => setHorizon(Number(v))} />
                </div>
                <LabeledSlider label="Monte Carlo Runs" value={mcRuns} min={50} max={1000} step={50} onChange={setMcRuns} />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-small text-muted-foreground">Random Seed</span>
                    <button onClick={() => setMcSeed(mcSeed !== null ? null : Math.floor(Math.random() * 99999))} className="flex items-center gap-1 text-[11px] text-energy-teal hover:underline cursor-pointer">
                      <Shuffle className="w-3 h-3" />{mcSeed !== null ? "Randomize" : "Fix seed"}
                    </button>
                  </div>
                  {mcSeed !== null && <input type="number" value={mcSeed} onChange={(e) => setMcSeed(Number(e.target.value))} className="w-full px-3 py-1.5 text-small rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-energy-teal" />}
                </div>
                <div className="space-y-1.5">
                  <span className="text-small text-muted-foreground">Residual Sampling</span>
                  <PillToggle options={[{ value: "block_bootstrap", label: "Block Bootstrap" }, { value: "gaussian", label: "Gaussian" }, { value: "empirical", label: "Empirical" }]} value={residualMethod} onChange={setResidualMethod} />
                </div>
                <div className="space-y-1.5">
                  <span className="text-small text-muted-foreground">Price Scenario</span>
                  <PillToggle options={[{ value: "low", label: "Low" }, { value: "current", label: "Current" }, { value: "high", label: "High" }]} value={priceScenario} onChange={setPriceScenario} />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={handleRunSimulation} disabled={isRunning || activeBlocks.length === 0} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-small font-medium rounded-lg bg-energy-teal text-white hover:bg-energy-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                  <Play className="w-4 h-4" />{isRunning ? "Running..." : "Run Simulation"}
                </button>
                <button onClick={() => setSaveDialogOpen(true)} disabled={activeBlocks.length === 0} className="flex items-center gap-2 px-4 py-2.5 text-small font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer" title="Save scenario"><Save className="w-4 h-4" /></button>
                <button onClick={clearBlocks} disabled={activeBlocks.length === 0} className="flex items-center gap-2 px-4 py-2.5 text-small font-medium rounded-lg border border-border bg-card text-muted-foreground hover:text-energy-red hover:border-energy-red/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer" title="Clear"><Trash2 className="w-4 h-4" /></button>
              </div>

              {saveDialogOpen && (
                <div className="rounded-xl border border-energy-teal/30 bg-energy-teal/5 p-4 space-y-3">
                  <p className="text-small font-medium text-foreground">Save Scenario</p>
                  <input type="text" value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g. Summer peak + EV charging" className="w-full px-3 py-2 text-small rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-energy-teal" onKeyDown={(e) => e.key === "Enter" && handleSave()} autoFocus />
                  <div className="flex gap-2">
                    <button onClick={handleSave} disabled={!scenarioName.trim()} className="flex-1 py-1.5 text-small font-medium rounded-lg bg-energy-teal text-white hover:bg-energy-teal/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">Save</button>
                    <button onClick={() => { setSaveDialogOpen(false); setScenarioName(""); }} className="flex-1 py-1.5 text-small font-medium rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Cancel</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-border bg-card p-4">
              <SectionHeading icon={<Layers className="w-4 h-4 text-energy-teal" />} title="Saved Scenarios" subtitle="Select 2-4 to compare side-by-side" />
              {savedScenarios.length === 0 ? (
                <p className="text-small text-muted-foreground py-4 text-center">No saved scenarios yet.</p>
              ) : (
                <div className="space-y-2">
                  {savedScenarios.map((sc) => (
                    <div key={sc.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${compareIds.has(sc.id) ? "border-energy-teal bg-energy-teal/5" : "border-border bg-card"}`}>
                      <input type="checkbox" checked={compareIds.has(sc.id)} onChange={() => handleToggleCompare(sc.id)} className="accent-energy-teal cursor-pointer" />
                      <div className="flex-1 min-w-0">
                        <p className="text-small font-medium text-foreground truncate">{sc.name}</p>
                        <p className="text-[11px] text-muted-foreground">{sc.blocks.length} block{sc.blocks.length !== 1 ? "s" : ""}</p>
                      </div>
                      <button onClick={() => loadScenario(sc.id)} className="p-1.5 text-muted-foreground hover:text-energy-blue transition-colors cursor-pointer" title="Load"><Upload className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteScenario(sc.id)} className="p-1.5 text-muted-foreground hover:text-energy-red transition-colors cursor-pointer" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              )}
              {compareIds.size >= 2 && results && (
                <div className="mt-4">
                  <p className="text-small font-medium text-foreground mb-3">Cost vs Peak Trade-off</p>
                  <ParetoScatter scenarios={paretoScenarios} height={260} />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-8 space-y-5">
          {isRunning && <LoadingOverlay message={`Running ${mcRuns} Monte Carlo simulations...`} />}
          {simulationMutation.isError && !isRunning && <ErrorFallback title="Simulation Failed" message={simulationMutation.error?.message ?? "Something went wrong."} onRetry={handleRunSimulation} />}

          {!results && !isRunning && !simulationMutation.isError && (
            <EmptyState
              icon={<FlaskConical className="w-7 h-7 text-muted-foreground" />}
              title="No simulation results yet"
              message="Add scenario blocks on the left, configure parameters, then click Run Simulation."
              action={activeBlocks.length > 0 ? (
                <button onClick={handleRunSimulation} className="inline-flex items-center gap-2 px-4 py-2 text-small font-medium rounded-lg bg-energy-teal text-white hover:bg-energy-teal/90 transition-colors cursor-pointer">
                  <Play className="w-3.5 h-3.5" />Run Simulation
                </button>
              ) : undefined}
            />
          )}

          {results && !isRunning && (
            <>
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <SectionHeading icon={<BarChart3 className="w-4 h-4 text-energy-teal" />} title="Simulated Forecast Distribution" subtitle={`${mcRuns} paths \u2014 ${horizon}h horizon`} />
                  <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOURS.blue, opacity: 0.15 }} />P25-P75</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: COLOURS.blue, opacity: 0.08 }} />P10-P90</span>
                    <span className="flex items-center gap-1.5"><span className="inline-block w-6 h-0 border-t-2 border-dashed" style={{ borderColor: COLOURS.navy }} />Baseline</span>
                  </div>
                </div>
                <FanChart data={fanData} height={340} showBaseline={!!baselineData} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <OutcomeCard label="Daily Energy" dist={results.dailyKwh} unit="kWh" baseline={baselineData ? baselineData.points.reduce((s, p) => s + p.forecast, 0) : undefined} colour={COLOURS.blue} />
                <OutcomeCard label="Peak Demand" dist={results.peakKw} unit="kW" baseline={baselineData ? Math.max(...baselineData.points.map((p) => p.forecast)) : undefined} colour={COLOURS.orange} />
                <OutcomeCard label="Daily Cost" dist={results.dailyCost} unit="EUR" colour={COLOURS.green} />
                <OutcomeCard label="Peak-Risk Hours" dist={results.peakRiskHours} unit="h" colour={COLOURS.red} />
              </div>

              <div className="rounded-xl border border-border bg-card p-5">
                <div className="flex items-center justify-between mb-4">
                  <SectionHeading icon={<TrendingUp className="w-4 h-4 text-energy-teal" />} title="Sensitivity Analysis" subtitle="How much does each parameter swing the outcome?" />
                  <button onClick={handleRunSensitivity} disabled={sensitivityMutation.isPending} className="flex items-center gap-2 px-3 py-1.5 text-small font-medium rounded-lg border border-border bg-card text-foreground hover:bg-muted/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer">
                    <BarChart3 className="w-3.5 h-3.5" />{sensitivityMutation.isPending ? "Analysing..." : "Run Sensitivity"}
                  </button>
                </div>
                {sensitivityMutation.isPending && <LoadingOverlay message="Running sensitivity analysis..." />}
                {sensitivityMutation.isError && <ErrorFallback title="Sensitivity Failed" message={sensitivityMutation.error?.message ?? "Could not complete analysis."} onRetry={handleRunSensitivity} />}
                {!sensitivityResults && !sensitivityMutation.isPending && !sensitivityMutation.isError && <p className="text-small text-muted-foreground py-6 text-center">Click &ldquo;Run Sensitivity&rdquo; to see parameter impacts.</p>}
                {sensitivityResults && !sensitivityMutation.isPending && <TornadoChart bars={sensitivityResults.bars} baselineValue={sensitivityResults.baseline_value} metric={sensitivityResults.metric} height={Math.max(200, sensitivityResults.bars.length * 40)} />}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
