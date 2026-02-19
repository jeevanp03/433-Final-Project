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
  MessageSquare,
  RefreshCw,
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

import KpiCard from "@/components/cards/KpiCard";
import RecommendationCard from "@/components/cards/RecommendationCard";
import SparkLine from "@/components/charts/SparkLine";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";

import { useStatus, useForecast, useDefaultRecommendations, useHistory } from "@/api/hooks";
import { useRecommendationStore, type Recommendation } from "@/stores/useRecommendationStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useSimulationStore } from "@/stores/useSimulationStore";
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

function PeakAlertBadge({ peakHour }: { peakHour: string }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-energy-red/30 bg-energy-red/5">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-energy-red opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-energy-red" />
      </span>
      <AlertTriangle className="w-4 h-4 text-energy-red" />
      <span className="text-card-title text-energy-red">Peak Alert</span>
      <span className="text-small text-energy-red/80">
        &mdash; Expected peak at {peakHour}
      </span>
    </div>
  );
}

function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-section-heading text-foreground">{title}</h3>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="flex items-center gap-1 text-small font-medium text-energy-blue hover:text-energy-blue/80 transition-colors cursor-pointer"
        >
          {actionLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function PanelCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className}`}>{children}</div>
  );
}

function PanelSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 animate-pulse ${height}`}>
      <div className="h-4 w-32 bg-muted rounded mb-4" />
      <div className="h-full bg-muted/50 rounded" />
    </div>
  );
}

function PanelError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-energy-red/20 bg-energy-red/5 p-5 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-energy-red shrink-0" />
      <p className="text-small text-energy-red">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function Dashboard() {
  const navigate = useNavigate();
  const { currency, touSchedule } = useSettingsStore();
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

  const today = useMemo(() => {
    const d = new Date();
    return {
      from: format(startOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
      to: format(endOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
    };
  }, []);

  const { data: todayHistory, isLoading: todayHistoryLoading } = useHistory({
    from: today.from,
    to: today.to,
    granularity: "hour",
    meter: "total",
  });

  const yesterday = useMemo(() => {
    const d = subDays(new Date(), 1);
    return {
      from: format(startOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
      to: format(endOfDay(d), "yyyy-MM-dd'T'HH:mm:ss"),
    };
  }, []);

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
    return recommendations.recommendations.slice(0, 2).map(scheduleEntryToRecommendation);
  }, [recommendations]);

  const todaySparkData = useMemo(
    () => todayHistory?.points?.map((p) => p.value) ?? [],
    [todayHistory],
  );
  const yesterdaySparkData = useMemo(
    () => yesterdayHistory?.points?.map((p) => p.value) ?? [],
    [yesterdayHistory],
  );

  // Quick simulation presets
  function launchSimulation(preset: "heatwave" | "ev" | "offpeak") {
    clearBlocks();
    const id = crypto.randomUUID();
    switch (preset) {
      case "heatwave":
        addBlock({ id, type: "temperature_shock", label: "Heat Wave (+8°C)", params: { delta_temp: 8, duration_days: 3 } });
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground">Dashboard</h2>
        <p className="text-small text-muted-foreground mt-1">
          Real-time overview of your household energy consumption
        </p>
      </div>

      {status?.alert && <PeakAlertBadge peakHour={status.forecast_peak_hour} />}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Current Draw" value={status?.current_kw ?? 0} unit="kW" icon={<Zap className="w-4 h-4" />} colour={COLOURS.blue} thresholds={{ warning: 3.0, danger: 5.0 }} onClick={() => navigate("/forecast")} loading={statusLoading} />
        <KpiCard label="Today's Total" value={status?.today_kwh ?? 0} unit="kWh" icon={<Battery className="w-4 h-4" />} colour={COLOURS.teal} onClick={() => navigate("/analytics")} loading={statusLoading} />
        <KpiCard label="Est. Daily Cost" value={status?.estimated_cost ?? 0} unit={currency} icon={<DollarSign className="w-4 h-4" />} colour={COLOURS.green} loading={statusLoading} />
        <KpiCard label="Forecast Peak" value={status?.forecast_peak_kw ?? 0} unit="kW" delta={status?.forecast_peak_kw && status.forecast_peak_kw > 4.0 ? ((status.forecast_peak_kw - 4.0) / 4.0) * 100 : undefined} deltaLabel="vs. 4 kW baseline" icon={<TrendingUp className="w-4 h-4" />} colour={status?.alert ? COLOURS.red : COLOURS.orange} thresholds={{ warning: 4.0, danger: 6.0 }} onClick={() => navigate("/forecast")} loading={statusLoading} />
      </div>

      {statusError && <PanelError message="Could not load status data. The backend server may be offline." />}

      {/* Main content: 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Forecast + Comparison */}
        <div className="lg:col-span-2 space-y-6">
          {forecastError ? (
            <PanelError message="Failed to load forecast data." />
          ) : forecastLoading ? (
            <PanelSkeleton height="h-72" />
          ) : forecast?.points ? (
            <PanelCard>
              <SectionHeader title="24h Forecast" actionLabel="Full forecast" onAction={() => navigate("/forecast")} />
              <div className="cursor-pointer" onClick={() => navigate("/forecast")}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={forecastSnapshotData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="forecastGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOURS.blue} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={COLOURS.blue} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={COLOURS.blue} stopOpacity={0.08} />
                        <stop offset="100%" stopColor={COLOURS.blue} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} width={36} />
                    <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: CHART_DEFAULTS.tooltipRadius, fontSize: 12 }} formatter={(value: number) => [`${value.toFixed(2)} kW`, undefined]} />
                    <Area dataKey="upper" stroke="none" fill="url(#bandGradient)" isAnimationActive={false} />
                    <Area dataKey="lower" stroke="none" fill="var(--card)" fillOpacity={0.8} isAnimationActive={false} />
                    <Area dataKey="forecast" stroke={COLOURS.blue} strokeWidth={2} fill="url(#forecastGradient)" animationDuration={CHART_DEFAULTS.animationDuration} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </PanelCard>
          ) : null}

          {/* Today vs Yesterday */}
          <PanelCard>
            <SectionHeader title="Today vs. Yesterday" />
            {todayHistoryLoading || yesterdayHistoryLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-10 bg-muted rounded" />
                <div className="h-10 bg-muted rounded" />
              </div>
            ) : todaySparkData.length === 0 && yesterdaySparkData.length === 0 ? (
              <p className="text-small text-muted-foreground">No historical data available for comparison.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-small text-muted-foreground mb-1">Today</p>
                    <p className="text-card-title text-foreground">
                      {todaySparkData.length > 0 ? `${todaySparkData.reduce((a, b) => a + b, 0).toFixed(1)} kWh` : "--"}
                    </p>
                  </div>
                  <SparkLine data={todaySparkData.length > 0 ? todaySparkData : [0]} colour={COLOURS.blue} height={36} width={120} />
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="text-small text-muted-foreground mb-1">Yesterday</p>
                    <p className="text-card-title text-foreground">
                      {yesterdaySparkData.length > 0 ? `${yesterdaySparkData.reduce((a, b) => a + b, 0).toFixed(1)} kWh` : "--"}
                    </p>
                  </div>
                  <SparkLine data={yesterdaySparkData.length > 0 ? yesterdaySparkData : [0]} colour={COLOURS.navy} height={36} width={120} />
                </div>
              </div>
            )}
          </PanelCard>
        </div>

        {/* Right: Cost donut + Quick Sim */}
        <div className="space-y-6">
          {forecastLoading ? (
            <PanelSkeleton height="h-64" />
          ) : forecastError ? null : (
            <PanelCard>
              <SectionHeader title="Cost Breakdown" />
              {touDonutData.length === 0 || touDonutTotal === 0 ? (
                <p className="text-small text-muted-foreground">No cost data available.</p>
              ) : (
                <div className="flex flex-col items-center">
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={touDonutData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value" animationDuration={CHART_DEFAULTS.animationDuration}>
                        {touDonutData.map((entry) => (
                          <Cell key={entry.name} fill={TOU_COLOURS[entry.name] ?? COLOURS.blue} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: CHART_DEFAULTS.tooltipRadius, fontSize: 12 }} formatter={(value: number) => [`${value.toFixed(3)} ${currency}`, undefined]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-2">
                    {touDonutData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: TOU_COLOURS[entry.name] ?? COLOURS.blue }} />
                        <span className="text-small text-muted-foreground">{entry.name}</span>
                        <span className="text-small font-medium text-foreground">{entry.value.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-small text-muted-foreground mt-2">Total: {touDonutTotal.toFixed(2)} {currency}</p>
                </div>
              )}
            </PanelCard>
          )}

          <PanelCard>
            <SectionHeader title="Quick Simulate" actionLabel="Custom" onAction={() => navigate("/simulate")} />
            <div className="space-y-2">
              <button onClick={() => launchSimulation("heatwave")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-energy-orange/40 hover:bg-energy-orange/5 transition-all text-left cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-energy-orange/10 flex items-center justify-center shrink-0"><Flame className="w-4 h-4 text-energy-orange" /></div>
                <div><p className="text-card-title text-foreground">Heat Wave</p><p className="text-small text-muted-foreground">+8°C for 3 days</p></div>
              </button>
              <button onClick={() => launchSimulation("ev")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-energy-blue/40 hover:bg-energy-blue/5 transition-all text-left cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-energy-blue/10 flex items-center justify-center shrink-0"><Car className="w-4 h-4 text-energy-blue" /></div>
                <div><p className="text-card-title text-foreground">EV Charger</p><p className="text-small text-muted-foreground">7 kW, 4h starting 6 PM</p></div>
              </button>
              <button onClick={() => launchSimulation("offpeak")} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-energy-green/40 hover:bg-energy-green/5 transition-all text-left cursor-pointer">
                <div className="w-8 h-8 rounded-lg bg-energy-green/10 flex items-center justify-center shrink-0"><Clock className="w-4 h-4 text-energy-green" /></div>
                <div><p className="text-card-title text-foreground">Shift All to Off-Peak</p><p className="text-small text-muted-foreground">Move loads to 22:00-06:00</p></div>
              </button>
            </div>
          </PanelCard>
        </div>
      </div>

      {/* Bottom: Recommendations + AI */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <SectionHeader title="Recommendations" actionLabel="All actions" onAction={() => navigate("/actions")} />
          {recoError ? (
            <PanelError message="Failed to load recommendations." />
          ) : recoLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-40" />
              <div className="rounded-xl border border-border bg-card p-4 animate-pulse h-40" />
            </div>
          ) : topRecommendations.length === 0 ? (
            <PanelCard>
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <RefreshCw className="w-8 h-8 text-muted-foreground mb-2" />
                <p className="text-body text-muted-foreground">No recommendations available right now.</p>
              </div>
            </PanelCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topRecommendations.map((reco) => (
                <RecommendationCard key={reco.id} reco={reco} onAccept={acceptReco} onSnooze={snoozeReco} onReject={rejectReco} />
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader title="AI Insights" />
          <PanelCard className="h-full">
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-xl bg-energy-purple/10 flex items-center justify-center mb-3">
                <MessageSquare className="w-6 h-6 text-energy-purple" />
              </div>
              <p className="text-card-title text-foreground mb-1">Auto-Narration</p>
              <p className="text-small text-muted-foreground max-w-[220px]">
                AI-generated insights about your energy patterns will appear here once the LLM integration is configured.
              </p>
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
