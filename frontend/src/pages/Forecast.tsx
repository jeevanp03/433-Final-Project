import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import {
  GitCompareArrows,
  History,
  DollarSign,
  Zap,
  ChevronRight,
  Info,
  Target,
  TrendingUp,
} from "lucide-react";

import ForecastChart from "@/components/charts/ForecastChart";
import ShapWaterfall from "@/components/charts/ShapWaterfall";
import ModelSelector from "@/components/controls/ModelSelector";
import HorizonToggle from "@/components/controls/HorizonToggle";
import ConfidenceSlider from "@/components/controls/ConfidenceSlider";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";
import ErrorFallback from "@/components/ui/ErrorFallback";
import LoadingOverlay from "@/components/ui/LoadingOverlay";

import type { ForecastPoint } from "@/types/api";
import { useForecast, useBacktest, useExplanation, useMetrics } from "@/api/hooks";
import { useForecastStore, type Horizon } from "@/stores/useForecastStore";
import { useUIStore } from "@/stores/useUIStore";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function horizonToHours(h: Horizon): number {
  const map: Record<Horizon, number> = { "6h": 6, "12h": 12, "24h": 24, "48h": 48, "7d": 168, "14d": 336 };
  return map[h];
}

const TOU_TIERS = [
  { start: 0, end: 6, label: "Off-Peak", rate: 0.12 },
  { start: 6, end: 9, label: "Mid-Peak", rate: 0.18 },
  { start: 9, end: 17, label: "On-Peak", rate: 0.24 },
  { start: 17, end: 20, label: "Mid-Peak", rate: 0.18 },
  { start: 20, end: 24, label: "Off-Peak", rate: 0.12 },
];

function fmtMetric(v: number | undefined): string {
  if (v === undefined || v === null) return "--";
  if (v >= 100) return v.toFixed(0);
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(3);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToggleSwitch({ label, active, onToggle, icon }: { label: string; active: boolean; onToggle: () => void; icon: React.ReactNode }) {
  return (
    <button onClick={onToggle} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer w-full ${active ? "border-energy-blue bg-energy-blue/5 text-foreground" : "border-border text-muted-foreground hover:border-energy-blue/40"}`}>
      <span className={active ? "text-energy-blue" : "text-muted-foreground"}>{icon}</span>
      <span className="text-small font-medium">{label}</span>
      <div className="ml-auto">
        <div className={`w-8 h-[18px] rounded-full transition-colors relative ${active ? "bg-energy-blue" : "bg-muted"}`}>
          <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform ${active ? "translate-x-4" : "translate-x-0.5"}`} />
        </div>
      </div>
    </button>
  );
}

function OriginPicker({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="text-small text-muted-foreground">Forecast origin</label>
      <input type="datetime-local" value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} min="2006-12-16T00:00" max="2010-11-26T23:00" className="w-full px-3 py-2 text-small border border-border rounded-lg bg-card text-foreground focus:outline-none focus:border-energy-blue transition-colors" />
      {value && (
        <button onClick={() => onChange(null)} className="text-[11px] text-energy-blue hover:underline cursor-pointer">Reset to latest</button>
      )}
    </div>
  );
}

function MetricsTable({ metrics, modelName }: { metrics: Record<string, number> | undefined; modelName: string }) {
  if (!metrics) return null;
  const rows = [
    { key: "mae", label: "MAE", unit: "kW" },
    { key: "rmse", label: "RMSE", unit: "kW" },
    { key: "mape", label: "MAPE", unit: "%" },
    { key: "peak_mae", label: "Peak MAE", unit: "kW" },
    { key: "coverage_90", label: "PI Coverage", unit: "%" },
  ];
  return (
    <div className="space-y-2">
      <h4 className="text-card-title text-foreground capitalize">{modelName}</h4>
      <div className="space-y-1">
        {rows.map(({ key, label, unit }) => (
          <div key={key} className="flex items-center justify-between py-1 border-b border-border/50 last:border-0">
            <span className="text-small text-muted-foreground">{label}</span>
            <span className="text-small font-medium text-foreground">{fmtMetric(metrics[key])} {unit}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResidualChart({ points }: { points: { horizon: number; residual: number }[] }) {
  const data = points.map((p) => ({ horizon: `h${p.horizon}`, residual: p.residual }));
  return (
    <div className="rounded-lg bg-card shadow-card p-4">
      <h3 className="text-card-title text-foreground mb-3">Residuals by Horizon</h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray} stroke={CHART_DEFAULTS.axisStroke} opacity={CHART_DEFAULTS.gridOpacity} />
          <XAxis dataKey="horizon" tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} />
          <YAxis tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} label={{ value: "kW", angle: -90, position: "insideLeft", style: { fontSize: 10 } }} />
          <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: CHART_DEFAULTS.tooltipRadius, fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(3)} kW`, "Residual"]} />
          <Bar dataKey="residual" radius={[2, 2, 0, 0]}>
            {data.map((entry, idx) => (
              <Cell key={idx} fill={entry.residual >= 0 ? COLOURS.red : COLOURS.blue} opacity={0.7} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Forecast() {
  const { origin, horizon, selectedModels, confidence, comparisonMode, backtestMode, showTouPricing, setOrigin, toggleComparisonMode, toggleBacktestMode, toggleTouPricing } = useForecastStore();
  const density = useUIStore((s) => s.density);

  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const primaryModel = selectedModels[0] ?? "xgboost";
  const horizonHours = horizonToHours(horizon);

  // Primary forecast
  const primaryForecast = useForecast({ model: primaryModel, horizon: horizonHours, origin, confidence });

  // Comparison forecasts (always call hooks, but only use when comparison mode is on)
  const comparisonModels = useMemo(
    () => comparisonMode ? selectedModels.filter((m) => m !== primaryModel) : [],
    [comparisonMode, selectedModels, primaryModel],
  );
  const compForecast1 = useForecast(comparisonModels.length >= 1 ? { model: comparisonModels[0], horizon: horizonHours, origin, confidence } : { model: primaryModel, horizon: horizonHours, origin, confidence });
  const compForecast2 = useForecast(comparisonModels.length >= 2 ? { model: comparisonModels[1], horizon: horizonHours, origin, confidence } : { model: primaryModel, horizon: horizonHours, origin, confidence });

  // Backtest
  const backtest = useBacktest(backtestMode && origin ? { origin, model_name: primaryModel } : {});

  // SHAP explanation
  const explanation = useExplanation(selectedHour !== null ? { hour: selectedHour, origin } : {});

  // Metrics
  const metricsQuery = useMetrics("test");

  // Computed
  const comp1Data = compForecast1.data;
  const comp2Data = compForecast2.data;
  const comparisonPoints = useMemo(() => {
    if (!comparisonMode || comparisonModels.length === 0) return undefined;
    const result: { model: string; points: ForecastPoint[] }[] = [];
    if (comparisonModels.length >= 1 && comp1Data && comparisonModels[0]) result.push({ model: comparisonModels[0], points: comp1Data.points });
    if (comparisonModels.length >= 2 && comp2Data && comparisonModels[1]) result.push({ model: comparisonModels[1], points: comp2Data.points });
    return result.length > 0 ? result : undefined;
  }, [comparisonMode, comparisonModels, comp1Data, comp2Data]);

  const forecastOrigin = primaryForecast.data?.origin;
  const forecastOriginDisplay = useMemo(() => {
    if (forecastOrigin) {
      try { return format(parseISO(forecastOrigin), "MMM d, yyyy HH:mm"); } catch { return forecastOrigin; }
    }
    return "Latest available";
  }, [forecastOrigin]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-page-title">Forecast Explorer</h2>
          <p className="text-small text-muted-foreground mt-1">Analyze forecasts, compare models, and explore SHAP explanations.</p>
        </div>
        <div className="flex items-center gap-2 text-small text-muted-foreground">
          <Target className="w-4 h-4" /><span>Origin: {forecastOriginDisplay}</span>
        </div>
      </div>

      {/* Control bar */}
      <div className="rounded-lg bg-card shadow-card p-4">
        <div className="flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="space-y-1.5">
            <label className="text-small text-muted-foreground">Horizon</label>
            <HorizonToggle />
          </div>
          <div className="min-w-[220px]"><OriginPicker value={origin} onChange={setOrigin} /></div>
          <div className="min-w-[180px]"><ConfidenceSlider /></div>
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <ToggleSwitch label="Compare" active={comparisonMode} onToggle={toggleComparisonMode} icon={<GitCompareArrows className="w-4 h-4" />} />
            <ToggleSwitch label="Backtest" active={backtestMode} onToggle={toggleBacktestMode} icon={<History className="w-4 h-4" />} />
            <ToggleSwitch label="TOU Pricing" active={showTouPricing} onToggle={toggleTouPricing} icon={<DollarSign className="w-4 h-4" />} />
          </div>
        </div>
      </div>

      {/* Chart + sidebar — hidden at glance density */}
      {density !== "glance" && <div className="flex flex-col lg:flex-row gap-6">
        {comparisonMode && (
          <div className="lg:w-[200px] shrink-0">
            <div className="rounded-lg bg-card shadow-card p-4 space-y-3">
              <h3 className="text-card-title text-foreground">Models</h3>
              <ModelSelector multi />
            </div>
          </div>
        )}

        {/* Main chart */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="rounded-lg bg-card shadow-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-energy-blue" />
                <h3 className="text-card-title text-foreground">{horizonHours}h Power Forecast{comparisonMode && " (Comparison)"}</h3>
              </div>
              {!comparisonMode && <ModelSelector />}
            </div>

            {primaryForecast.isLoading && <LoadingOverlay message="Loading forecast..." />}
            {primaryForecast.isError && <ErrorFallback title="Forecast unavailable" message="Could not load forecast data." onRetry={() => primaryForecast.refetch()} />}
            {primaryForecast.data && !primaryForecast.isLoading && !primaryForecast.isError && (
              <div onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const xPct = (e.clientX - rect.left) / rect.width;
                const idx = Math.round(xPct * (primaryForecast.data!.points.length - 1));
                if (idx >= 0 && idx < primaryForecast.data!.points.length) setSelectedHour(idx);
              }} className="cursor-crosshair">
                <ForecastChart points={primaryForecast.data.points} showConfidence touPricing={showTouPricing ? TOU_TIERS : undefined} height={420} comparisonPoints={comparisonPoints} />
              </div>
            )}

            {primaryForecast.data && (
              <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center gap-1.5"><div className="w-5 h-0.5" style={{ backgroundColor: COLOURS.navy }} /><span className="text-[11px] text-muted-foreground">Actual</span></div>
                <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 border-t-2 border-dashed" style={{ borderColor: COLOURS.blue }} /><span className="text-[11px] text-muted-foreground">{primaryModel} forecast</span></div>
                {comparisonPoints?.map(({ model }) => (
                  <div key={model} className="flex items-center gap-1.5"><div className="w-5 h-0.5 border-t-2 border-dashed" style={{ borderColor: model === "ridge" ? COLOURS.teal : model === "naive" ? COLOURS.orange : COLOURS.purple }} /><span className="text-[11px] text-muted-foreground">{model}</span></div>
                ))}
                <div className="flex items-center gap-1.5"><div className="w-5 h-3 rounded-sm" style={{ backgroundColor: COLOURS.blue, opacity: 0.1 }} /><span className="text-[11px] text-muted-foreground">{confidence}% CI</span></div>
              </div>
            )}
          </div>

          {/* Backtest residuals — deep dive only */}
          {density === "deep_dive" && backtestMode && origin && (
            <>
              {backtest.isLoading && <LoadingOverlay message="Loading backtest..." />}
              {backtest.isError && <ErrorFallback title="Backtest unavailable" message="Select a valid historical origin." onRetry={() => backtest.refetch()} />}
              {backtest.data && backtest.data.points.length > 0 && (
                <div className="space-y-4">
                  <ResidualChart points={backtest.data.points} />
                  <div className="rounded-lg bg-card shadow-card p-4">
                    <h3 className="text-card-title text-foreground mb-3">Backtest Metrics</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {Object.entries(backtest.data.metrics).map(([key, value]) => (
                        <div key={key} className="text-center p-2 rounded-lg bg-muted/50">
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{key.replace(/_/g, " ")}</p>
                          <p className="text-card-title text-foreground mt-0.5">{fmtMetric(value)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {backtest.data && backtest.data.points.length === 0 && (
                <div className="rounded-lg bg-card shadow-card p-6 text-center">
                  <Info className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
                  <p className="text-small text-muted-foreground">No backtest data for this origin. Try a date within Jan 2009 &ndash; Nov 2010.</p>
                </div>
              )}
            </>
          )}

          {density === "deep_dive" && selectedHour === null && primaryForecast.data && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-energy-blue/5 border border-energy-blue/20">
              <Info className="w-4 h-4 text-energy-blue shrink-0" />
              <p className="text-small text-muted-foreground">Click on any forecast point to view its SHAP feature attributions.</p>
            </div>
          )}
        </div>

        {/* Right sidebar — deep dive only */}
        {density === "deep_dive" && <div className={`lg:w-[320px] shrink-0 space-y-4 transition-all ${sidebarOpen ? "" : "lg:w-0 lg:overflow-hidden lg:opacity-0"}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="hidden lg:flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${sidebarOpen ? "rotate-180" : ""}`} />
            {sidebarOpen ? "Hide details" : "Show details"}
          </button>

          {/* Model accuracy */}
          <div className="rounded-lg bg-card shadow-card p-4 space-y-4">
            <div className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-energy-teal" /><h3 className="text-card-title text-foreground">Model Accuracy</h3></div>
            {metricsQuery.isLoading && <LoadingOverlay message="Loading metrics..." />}
            {metricsQuery.isError && <p className="text-small text-muted-foreground">Metrics unavailable</p>}
            {metricsQuery.data && (
              <div className="space-y-4">
                {selectedModels.map((model) => <MetricsTable key={model} modelName={model} metrics={metricsQuery.data![model]} />)}
              </div>
            )}
          </div>

          {/* SHAP */}
          <div className="rounded-lg bg-card shadow-card p-4 space-y-3">
            <div className="flex items-center gap-2"><Info className="w-4 h-4 text-energy-orange" /><h3 className="text-card-title text-foreground">Feature Attributions</h3></div>
            {selectedHour !== null ? (
              <>
                <p className="text-[11px] text-muted-foreground">
                  SHAP values for h+{selectedHour + 1}
                  {primaryForecast.data?.points[selectedHour] && <> ({format(parseISO(primaryForecast.data.points[selectedHour].timestamp), "MMM d, HH:mm")})</>}
                </p>
                {explanation.isLoading && <LoadingOverlay message="Loading SHAP..." />}
                {explanation.isError && <p className="text-small text-muted-foreground">Explanation unavailable.</p>}
                {explanation.data && (
                  <>
                    <ShapWaterfall drivers={explanation.data.drivers} maxBars={8} height={260} />
                    {explanation.data.narrative && (
                      <div className="mt-3 p-3 rounded-lg bg-muted/50"><p className="text-small text-muted-foreground leading-relaxed">{explanation.data.narrative}</p></div>
                    )}
                  </>
                )}
                <button onClick={() => setSelectedHour(null)} className="text-[11px] text-energy-blue hover:underline cursor-pointer">Clear selection</button>
              </>
            ) : (
              <div className="py-6 text-center">
                <Info className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-small text-muted-foreground">Click a forecast point to see feature attributions.</p>
              </div>
            )}
          </div>

          {/* Forecast summary */}
          {primaryForecast.data && (
            <div className="rounded-lg bg-card shadow-card p-4">
              <h3 className="text-card-title text-foreground mb-2">Forecast Summary</h3>
              <div className="space-y-2">
                {[
                  ["Model", primaryForecast.data.model],
                  ["Horizon", `${primaryForecast.data.horizon}h`],
                  ["Confidence", `${confidence}%`],
                  ["Points", String(primaryForecast.data.points.length)],
                  ["Peak", `${Math.max(...primaryForecast.data.points.map((p) => p.forecast)).toFixed(2)} kW`],
                  ["Min", `${Math.min(...primaryForecast.data.points.map((p) => p.forecast)).toFixed(2)} kW`],
                  ["Avg", `${(primaryForecast.data.points.reduce((s, p) => s + p.forecast, 0) / primaryForecast.data.points.length).toFixed(2)} kW`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between text-small">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-foreground font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>}
      </div>}
    </div>
  );
}
