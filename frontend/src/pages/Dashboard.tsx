import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import {
  Zap,
  Battery,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Flame,
  Car,
  Clock,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";

import KpiCard from "@/components/cards/KpiCard";
import RecommendationCard from "@/components/cards/RecommendationCard";
import NarrationPanel from "@/components/chat/NarrationPanel";
import SparkLine from "@/components/charts/SparkLine";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";

import { useStatus, useForecast, useDefaultRecommendations, useHistory } from "@/api/hooks";
import { useRecommendationStore, type Recommendation } from "@/stores/useRecommendationStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useSimulationStore } from "@/stores/useSimulationStore";
import { useUIStore } from "@/stores/useUIStore";
import type { ScheduleEntry } from "@/types/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOU_COLOURS: Record<string, string> = {
  "Off-Peak": COLOURS.green,
  "Mid-Peak": COLOURS.orange,
  "On-Peak": COLOURS.red,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scheduleEntryToRecommendation(entry: ScheduleEntry, index: number): Recommendation {
  const urgency: Recommendation["urgency"] =
    entry.savings_cost > 0.5 ? "high" : entry.savings_cost > 0.2 ? "medium" : "low";

  return {
    id: `reco-${index}-${entry.appliance}`,
    appliance: entry.appliance,
    applianceIcon: "zap",
    shiftFrom: `Hour ${entry.start_hour}`,
    shiftTo: entry.shift_description,
    savingsKwh: entry.power_kw * entry.duration_h,
    savingsCost: entry.savings_cost,
    peakReduction: 0,
    urgency,
    explanation: entry.shift_description,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

function computeTouBreakdown(
  forecastPoints: { timestamp: string; forecast: number }[],
  touSchedule: { label: string; startHour: number; endHour: number; rate: number }[],
) {
  const breakdown: Record<string, number> = {};
  for (const tier of touSchedule) breakdown[tier.label] = 0;

  for (const pt of forecastPoints) {
    const hour = new Date(pt.timestamp).getHours();
    for (const tier of touSchedule) {
      let inTier = false;
      if (tier.startHour < tier.endHour) {
        inTier = hour >= tier.startHour && hour < tier.endHour;
      } else {
        inTier = hour >= tier.startHour || hour < tier.endHour;
      }
      if (inTier) {
        breakdown[tier.label] += pt.forecast * tier.rate;
        break;
      }
    }
  }

  return Object.entries(breakdown).map(([label, cost]) => ({
    name: label,
    value: Math.max(0, Number(cost.toFixed(3))),
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function formatPeakHour(raw: string): string {
  try {
    const d = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
    if (isNaN(d.getTime())) return raw;
    return format(d, "h:mm a");
  } catch {
    return raw;
  }
}

function PeakAlertBadge({ peakHour }: { peakHour: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-energy-red/6 border border-energy-red/15">
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-energy-red opacity-75" />
        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-energy-red" />
      </span>
      <span className="text-[11px] font-medium text-energy-red">Peak at {formatPeakHour(peakHour)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const navigate = useNavigate();
  const { currency, touSchedule } = useSettingsStore();
  const density = useUIStore((s) => s.density);
  const { acceptReco, snoozeReco, rejectReco } = useRecommendationStore();
  const { addBlock, clearBlocks } = useSimulationStore();

  // Data fetching
  const { data: status, isLoading: statusLoading, isError: statusError } = useStatus();
  const { data: forecast, isLoading: forecastLoading, isError: forecastError } = useForecast({
    model: "xgboost",
    horizon: 24,
  });
  const { data: recommendations, isLoading: recoLoading, isError: recoError } =
    useDefaultRecommendations();

  // Use dataset's last day as "today" instead of real today
  const dataEnd = useMemo(() => {
    if (!status?.data_end) return null;
    try { return parseISO(status.data_end.replace(" ", "T")); } catch { return null; }
  }, [status]);

  const today = useMemo(() => {
    const d = dataEnd ?? new Date();
    return {
      from: format(startOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
      to: format(endOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
    };
  }, [dataEnd]);

  const { data: todayHistory, isLoading: todayHistoryLoading } = useHistory({
    from: today.from,
    to: today.to,
    granularity: "hour",
    meter: "total",
  });

  const yesterday = useMemo(() => {
    const d = dataEnd ? subDays(dataEnd, 1) : subDays(new Date(), 1);
    return {
      from: format(startOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
      to: format(endOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
    };
  }, [dataEnd]);

  const { data: yesterdayHistory, isLoading: yesterdayHistoryLoading } = useHistory({
    from: yesterday.from,
    to: yesterday.to,
    granularity: "hour",
    meter: "total",
  });

  // Derived data
  const forecastSnapshotData = useMemo(() => {
    if (!forecast?.points) return [];
    return forecast.points.map((pt) => ({
      time: format(new Date(pt.timestamp), "HH:mm"),
      forecast: Number(pt.forecast.toFixed(2)),
      lower: Number(pt.lower.toFixed(2)),
      upper: Number(pt.upper.toFixed(2)),
    }));
  }, [forecast]);

  const touDonutData = useMemo(() => {
    if (!forecast?.points) return [];
    return computeTouBreakdown(forecast.points, touSchedule);
  }, [forecast, touSchedule]);

  const touDonutTotal = useMemo(
    () => touDonutData.reduce((sum, d) => sum + d.value, 0),
    [touDonutData],
  );

  const topRecommendations = useMemo<Recommendation[]>(() => {
    if (!recommendations?.recommendations) return [];
    return recommendations.recommendations.slice(0, 3).map(scheduleEntryToRecommendation);
  }, [recommendations]);

  const todaySparkData = useMemo(
    () => todayHistory?.points?.map((p) => p.value) ?? [],
    [todayHistory],
  );
  const yesterdaySparkData = useMemo(
    () => yesterdayHistory?.points?.map((p) => p.value) ?? [],
    [yesterdayHistory],
  );

  const todayTotal = useMemo(
    () => todaySparkData.reduce((a, b) => a + b, 0),
    [todaySparkData],
  );
  const yesterdayTotal = useMemo(
    () => yesterdaySparkData.reduce((a, b) => a + b, 0),
    [yesterdaySparkData],
  );
  const dayDelta = useMemo(() => {
    if (yesterdayTotal === 0) return null;
    return ((todayTotal - yesterdayTotal) / yesterdayTotal) * 100;
  }, [todayTotal, yesterdayTotal]);

  // Quick simulation presets
  function launchSimulation(preset: "heatwave" | "ev" | "offpeak") {
    clearBlocks();
    const id = crypto.randomUUID();
    switch (preset) {
      case "heatwave":
        addBlock({ id, type: "temperature_shock", label: "Heat Wave (+8\u00B0C)", params: { delta_temp: 8, duration_days: 3 } });
        break;
      case "ev":
        addBlock({ id, type: "add_appliance", label: "EV Charger (7 kW)", params: { power_kw: 7, duration_h: 4, start_hour: 18 } });
        break;
      case "offpeak":
        addBlock({ id, type: "shift", label: "Shift All to Off-Peak", params: { target_window_start: 22, target_window_end: 6, fraction: 1.0 } });
        break;
    }
    navigate("/simulate");
  }

  // Data context label
  const dataLabel = dataEnd ? format(dataEnd, "MMM d, yyyy") : null;

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-page-title text-foreground">Dashboard</h2>
          {dataLabel && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <Calendar className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">Data as of {dataLabel}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status?.alert && <PeakAlertBadge peakHour={status.forecast_peak_hour} />}
        </div>
      </div>

      {statusError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-energy-red/4 border border-energy-red/12">
          <AlertTriangle className="w-3.5 h-3.5 text-energy-red shrink-0" />
          <p className="text-[11px] text-energy-red/80">Backend server may be offline.</p>
        </div>
      )}

      {/* KPI Row — compact */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <KpiCard label="Current Draw" value={status?.current_kw ?? 0} unit="kW" icon={<Zap className="w-3.5 h-3.5" />} colour={COLOURS.blue} thresholds={{ warning: 3.0, danger: 5.0 }} onClick={() => navigate("/forecast")} loading={statusLoading} />
        <KpiCard label="Today's Total" value={status?.today_kwh ?? 0} unit="kWh" icon={<Battery className="w-3.5 h-3.5" />} colour={COLOURS.teal} onClick={() => navigate("/analytics")} loading={statusLoading} />
        <KpiCard label="Est. Daily Cost" value={status?.estimated_cost ?? 0} unit={currency} icon={<DollarSign className="w-3.5 h-3.5" />} colour={COLOURS.green} loading={statusLoading} />
        <KpiCard label="Forecast Peak" value={status?.forecast_peak_kw ?? 0} unit="kW" delta={status?.forecast_peak_kw && status.forecast_peak_kw > 4.0 ? ((status.forecast_peak_kw - 4.0) / 4.0) * 100 : undefined} deltaLabel="vs. 4 kW baseline" icon={<TrendingUp className="w-3.5 h-3.5" />} colour={status?.alert ? COLOURS.red : COLOURS.orange} thresholds={{ warning: 4.0, danger: 6.0 }} onClick={() => navigate("/forecast")} loading={statusLoading} />
      </div>

      {/* Main content grid */}
      {density !== "glance" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Forecast chart — hero (8 cols) */}
          <div className="lg:col-span-8">
            {forecastError ? (
              <div className="rounded-lg bg-energy-red/4 border border-energy-red/12 p-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-energy-red shrink-0" />
                <p className="text-[11px] text-energy-red/80">Failed to load forecast.</p>
              </div>
            ) : forecastLoading ? (
              <div className="rounded-lg bg-card shadow-card p-4 animate-pulse h-[280px]">
                <div className="h-3 w-24 bg-muted rounded mb-3" />
                <div className="h-full bg-muted/40 rounded" />
              </div>
            ) : forecast?.points ? (
              <div className="rounded-lg bg-card shadow-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[13px] font-semibold text-foreground">24h Forecast</h3>
                  <button onClick={() => navigate("/forecast")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                    Details <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
                <div className="cursor-pointer -mx-1" onClick={() => navigate("/forecast")}>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={forecastSnapshotData} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                      <defs>
                        <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLOURS.blue} stopOpacity={0.18} />
                          <stop offset="100%" stopColor={COLOURS.blue} stopOpacity={0.01} />
                        </linearGradient>
                        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={COLOURS.blue} stopOpacity={0.05} />
                          <stop offset="100%" stopColor={COLOURS.blue} stopOpacity={0.01} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} interval="preserveStartEnd" />
                      <YAxis tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} width={32} />
                      <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: 6, fontSize: 11 }} formatter={(value) => [`${Number(value).toFixed(2)} kW`, undefined]} />
                      <Area dataKey="upper" stroke="none" fill="url(#bg)" isAnimationActive={false} />
                      <Area dataKey="lower" stroke="none" fill="var(--card)" fillOpacity={0.8} isAnimationActive={false} />
                      <Area dataKey="forecast" stroke={COLOURS.blue} strokeWidth={1.5} fill="url(#fg)" animationDuration={CHART_DEFAULTS.animationDuration} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : null}
          </div>

          {/* Right column — cost + comparison (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            {/* Cost Breakdown */}
            {!forecastLoading && !forecastError && (
              <div className="rounded-lg bg-card shadow-card p-4">
                <h3 className="text-[13px] font-semibold text-foreground mb-2">Cost Breakdown</h3>
                {touDonutData.length === 0 || touDonutTotal === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No cost data.</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-[100px] h-[100px] shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={touDonutData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} paddingAngle={2} dataKey="value" animationDuration={CHART_DEFAULTS.animationDuration} strokeWidth={0}>
                            {touDonutData.map((entry) => (
                              <Cell key={entry.name} fill={TOU_COLOURS[entry.name] ?? COLOURS.blue} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: 6, fontSize: 11 }} formatter={(value) => [`${Number(value).toFixed(2)} ${currency}`, undefined]} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {touDonutData.map((entry) => (
                        <div key={entry.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: TOU_COLOURS[entry.name] ?? COLOURS.blue }} />
                            <span className="text-[11px] text-muted-foreground">{entry.name}</span>
                          </div>
                          <span className="text-[11px] font-medium text-foreground tabular-nums">{entry.value.toFixed(2)}</span>
                        </div>
                      ))}
                      <div className="pt-1 border-t border-border/50 flex justify-between">
                        <span className="text-[11px] text-muted-foreground">Total</span>
                        <span className="text-[11px] font-semibold text-foreground tabular-nums">{touDonutTotal.toFixed(2)} {currency}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Today vs Yesterday */}
            <div className="rounded-lg bg-card shadow-card p-4">
              <h3 className="text-[13px] font-semibold text-foreground mb-2">Today vs. Yesterday</h3>
              {todayHistoryLoading || yesterdayHistoryLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-8 bg-muted rounded" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              ) : todaySparkData.length === 0 && yesterdaySparkData.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">No data available.</p>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Today</p>
                      <p className="text-[15px] font-semibold text-foreground tabular-nums">{todayTotal > 0 ? `${todayTotal.toFixed(1)} kWh` : "--"}</p>
                    </div>
                    <SparkLine data={todaySparkData.length > 0 ? todaySparkData : [0]} colour={COLOURS.blue} height={28} width={80} />
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Yesterday</p>
                      <p className="text-[15px] font-semibold text-foreground tabular-nums">{yesterdayTotal > 0 ? `${yesterdayTotal.toFixed(1)} kWh` : "--"}</p>
                    </div>
                    <SparkLine data={yesterdaySparkData.length > 0 ? yesterdaySparkData : [0]} colour={COLOURS.navy} height={28} width={80} />
                  </div>
                  {dayDelta !== null && (
                    <div className="flex items-center gap-1 pt-1 border-t border-border/50">
                      {dayDelta > 0 ? (
                        <ArrowUpRight className="w-3 h-3 text-energy-red" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 text-energy-green" />
                      )}
                      <span className={`text-[11px] font-medium ${dayDelta > 0 ? "text-energy-red" : "text-energy-green"}`}>
                        {dayDelta > 0 ? "+" : ""}{dayDelta.toFixed(1)}% vs yesterday
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recommendations — full width */}
          <div className="lg:col-span-8">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-semibold text-foreground">Recommendations</h3>
              <button onClick={() => navigate("/actions")} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                All actions <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            {recoError ? (
              <div className="rounded-lg bg-energy-red/4 border border-energy-red/12 p-3 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-energy-red shrink-0" />
                <p className="text-[11px] text-energy-red/80">Failed to load recommendations.</p>
              </div>
            ) : recoLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {[0, 1, 2].map((i) => <div key={i} className="rounded-lg bg-card shadow-card p-3 animate-pulse h-28" />)}
              </div>
            ) : topRecommendations.length === 0 ? (
              <div className="rounded-lg bg-card shadow-card p-4 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-muted-foreground/40 mr-2" />
                <p className="text-[11px] text-muted-foreground">No recommendations right now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                {topRecommendations.map((reco) => (
                  <RecommendationCard key={reco.id} reco={reco} onAccept={acceptReco} onSnooze={snoozeReco} onReject={rejectReco} />
                ))}
              </div>
            )}
          </div>

          {/* Quick Simulate — right column */}
          <div className="lg:col-span-4">
            <div className="rounded-lg bg-card shadow-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[13px] font-semibold text-foreground">Quick Simulate</h3>
                <button onClick={() => navigate("/simulate")} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Custom</button>
              </div>
              <div className="space-y-1.5">
                {([
                  { key: "heatwave" as const, icon: Flame, label: "Heat Wave", desc: "+8\u00B0C, 3 days", color: COLOURS.orange },
                  { key: "ev" as const, icon: Car, label: "EV Charger", desc: "7 kW, 4h @ 6 PM", color: COLOURS.blue },
                  { key: "offpeak" as const, icon: Clock, label: "Off-Peak Shift", desc: "22:00\u201306:00", color: COLOURS.green },
                ]).map(({ key, icon: Icon, label, desc, color }) => (
                  <button key={key} onClick={() => launchSimulation(key)} className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md border border-border hover:border-border hover:bg-accent/60 transition-all text-left cursor-pointer group">
                    <div className="w-6 h-6 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}10` }}>
                      <Icon className="w-3 h-3" style={{ color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-foreground leading-tight">{label}</p>
                      <p className="text-[10px] text-muted-foreground">{desc}</p>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground/0 group-hover:text-muted-foreground transition-colors shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Insights — deep_dive only */}
      {density === "deep_dive" && (
        <NarrationPanel page="dashboard" visible />
      )}
    </div>
  );
}
