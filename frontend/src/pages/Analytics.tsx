import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush, Legend,
} from "recharts";
import { format, parseISO, subDays } from "date-fns";
import { ChevronDown, ChevronRight, BarChart3 } from "lucide-react";

import DateRangePicker from "@/components/controls/DateRangePicker";
import GranularityToggle from "@/components/controls/GranularityToggle";
import SubMeterFilter from "@/components/controls/SubMeterFilter";
import Heatmap from "@/components/charts/Heatmap";
import DecompositionPanel from "@/components/charts/DecompositionPanel";
import BoxPlotPanel from "@/components/charts/BoxPlotPanel";
import CostBreakdown from "@/components/charts/CostBreakdown";
import KpiCard from "@/components/cards/KpiCard";
import { COLOURS, CHART_DEFAULTS, CHART_COLOUR_SEQUENCE } from "@/theme/chartTheme";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import ErrorFallback from "@/components/ui/ErrorFallback";

import { useHistory, useDecomposition } from "@/api/hooks";
import { useAnalyticsStore, type Granularity } from "@/stores/useAnalyticsStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useUIStore } from "@/stores/useUIStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ApiMeter = "total" | "sub1" | "sub2" | "sub3" | "other";

const METER_LABELS: Record<ApiMeter, string> = {
  total: "Total", sub1: "Kitchen", sub2: "Laundry", sub3: "Water Heater/AC", other: "Other",
};

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg bg-card shadow-card">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-5 py-3 text-left cursor-pointer">
        <h3 className="text-section-heading text-foreground">{title}</h3>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Analytics() {
  const { dateRange, granularity, subMeterFilter, compareMode, setDateRange, setGranularity, setCompareMode } = useAnalyticsStore();
  const { currency, touSchedule } = useSettingsStore();
  const density = useUIStore((s) => s.density);

  // Map store SubMeter values to API meter names
  const selectedMeters: ApiMeter[] = useMemo(() => {
    return (subMeterFilter as unknown as ApiMeter[]);
  }, [subMeterFilter]);

  // Date range for API
  const fromDate = useMemo(() => dateRange ? new Date(dateRange[0]) : subDays(new Date(), 30), [dateRange]);
  const toDate = useMemo(() => dateRange ? new Date(dateRange[1]) : new Date(), [dateRange]);
  const fromStr = format(fromDate, "yyyy-MM-dd'T'HH:mm:ss");
  const toStr = format(toDate, "yyyy-MM-dd'T'HH:mm:ss");

  // API granularity (minute not supported by API)
  const apiGranularity = granularity === "minute" ? "hour" : granularity as "hour" | "day" | "week" | "month";

  // Fetch history for each selected meter
  const meter0 = selectedMeters[0] ?? "total";
  const meter1 = selectedMeters[1];
  const meter2 = selectedMeters[2];
  const meter3 = selectedMeters[3];

  const h0 = useHistory({ from: fromStr, to: toStr, granularity: apiGranularity, meter: meter0 });
  const h1 = useHistory(meter1 ? { from: fromStr, to: toStr, granularity: apiGranularity, meter: meter1 } : { from: fromStr, to: toStr, granularity: apiGranularity, meter: meter0 });
  const h2 = useHistory(meter2 ? { from: fromStr, to: toStr, granularity: apiGranularity, meter: meter2 } : { from: fromStr, to: toStr, granularity: apiGranularity, meter: meter0 });
  const h3 = useHistory(meter3 ? { from: fromStr, to: toStr, granularity: apiGranularity, meter: meter3 } : { from: fromStr, to: toStr, granularity: apiGranularity, meter: meter0 });

  // Decomposition
  const decomposition = useDecomposition({ from: fromStr, to: toStr, period: 24 });

  const isLoading = h0.isLoading;
  const isError = h0.isError;

  // Build chart data: merge all meter traces by timestamp
  const chartData = useMemo(() => {
    const primary = h0.data?.points ?? [];
    if (primary.length === 0) return [];

    const map = new Map<string, Record<string, number>>();
    for (const p of primary) {
      map.set(p.timestamp, { [meter0]: p.value });
    }

    const extras: [ApiMeter | undefined, typeof h1][] = [[meter1, h1], [meter2, h2], [meter3, h3]];
    for (const [meter, query] of extras) {
      if (!meter || meter === meter0) continue;
      for (const p of query.data?.points ?? []) {
        const row = map.get(p.timestamp);
        if (row) row[meter] = p.value;
      }
    }

    return Array.from(map.entries()).map(([ts, values]) => ({
      timestamp: ts,
      label: format(parseISO(ts), apiGranularity === "hour" ? "MMM d HH:mm" : "MMM d"),
      ...values,
    }));
  }, [h0.data, h1, h2, h3, meter0, meter1, meter2, meter3, apiGranularity]);

  // KPI summaries from primary meter
  const kpis = useMemo(() => {
    const pts = h0.data?.points ?? [];
    if (pts.length === 0) return { avg: 0, peak: 0, total: 0, cost: 0 };
    const values = pts.map((p) => p.value);
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const peak = Math.max(...values);
    const total = values.reduce((a, b) => a + b, 0);
    // Rough cost estimate from TOU schedule
    let cost = 0;
    for (const p of pts) {
      const hour = new Date(p.timestamp).getHours();
      const tier = touSchedule.find((t) => {
        if (t.startHour < t.endHour) return hour >= t.startHour && hour < t.endHour;
        return hour >= t.startHour || hour < t.endHour;
      });
      cost += p.value * (tier?.rate ?? 0.15);
    }
    return { avg, peak, total, cost };
  }, [h0.data, touSchedule]);

  // Heatmap data (only for hourly granularity)
  const heatmapData = useMemo(() => {
    if (apiGranularity !== "hour") return [];
    return (h0.data?.points ?? []).map((p) => {
      const d = parseISO(p.timestamp);
      return { date: format(d, "yyyy-MM-dd"), hour: d.getHours(), value: p.value };
    });
  }, [h0.data, apiGranularity]);

  // Box plot data grouped by hour
  const boxPlotData = useMemo(() => {
    if (apiGranularity !== "hour") return [];
    const buckets = new Map<number, number[]>();
    for (const p of h0.data?.points ?? []) {
      const hour = new Date(p.timestamp).getHours();
      if (!buckets.has(hour)) buckets.set(hour, []);
      buckets.get(hour)!.push(p.value);
    }
    return Array.from(buckets.entries()).sort((a, b) => a[0] - b[0]).map(([hour, vals]) => {
      vals.sort((a, b) => a - b);
      const q = (p: number) => vals[Math.floor(p * vals.length)] ?? 0;
      return { label: `${hour}:00`, min: vals[0], q1: q(0.25), median: q(0.5), q3: q(0.75), max: vals[vals.length - 1] };
    });
  }, [h0.data, apiGranularity]);

  // Cost breakdown data
  const costData = useMemo(() => {
    const pts = h0.data?.points ?? [];
    if (pts.length === 0) return [];
    // Group by day
    const days = new Map<string, { offPeak: number; midPeak: number; onPeak: number }>();
    for (const p of pts) {
      const d = format(parseISO(p.timestamp), "MMM d");
      if (!days.has(d)) days.set(d, { offPeak: 0, midPeak: 0, onPeak: 0 });
      const hour = new Date(p.timestamp).getHours();
      const entry = days.get(d)!;
      const tier = touSchedule.find((t) => {
        if (t.startHour < t.endHour) return hour >= t.startHour && hour < t.endHour;
        return hour >= t.startHour || hour < t.endHour;
      });
      const tierLabel = tier?.label ?? "On-Peak";
      if (tierLabel === "Off-Peak") entry.offPeak += p.value * (tier?.rate ?? 0.12);
      else if (tierLabel === "Mid-Peak") entry.midPeak += p.value * (tier?.rate ?? 0.16);
      else entry.onPeak += p.value * (tier?.rate ?? 0.24);
    }
    return Array.from(days.entries()).slice(-14).map(([period, costs]) => ({ period, ...costs }));
  }, [h0.data, touSchedule]);

  // Unique meters for multi-trace chart
  const activeMeters = useMemo(() => {
    const set = new Set<ApiMeter>();
    set.add(meter0);
    if (meter1 && meter1 !== meter0) set.add(meter1);
    if (meter2 && meter2 !== meter0) set.add(meter2);
    if (meter3 && meter3 !== meter0) set.add(meter3);
    return Array.from(set);
  }, [meter0, meter1, meter2, meter3]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground">Usage Analytics</h2>
        <p className="text-small text-muted-foreground mt-1">Explore historical consumption patterns, seasonal trends, and cost breakdown.</p>
      </div>

      {/* Filter bar */}
      <div className="rounded-lg bg-card shadow-card p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">
          <div className="min-w-[260px]">
            <DateRangePicker from={fromDate} to={toDate} onChange={(f, t) => { if (f && t) setDateRange([f.toISOString(), t.toISOString()]); else setDateRange(null); }} minDate={new Date("2006-12-01")} maxDate={new Date("2010-11-30")} />
          </div>
          <GranularityToggle value={granularity} onChange={(g) => setGranularity(g as Granularity)} available={["hour", "day", "week", "month"]} />
          <SubMeterFilter selected={selectedMeters} onChange={(m) => useAnalyticsStore.getState().setSubMeterFilter(m as typeof subMeterFilter)} />
          <button onClick={() => setCompareMode(compareMode === "none" ? "previous_period" : "none")} className={`px-3 py-1.5 text-small font-medium rounded-lg border transition-colors cursor-pointer ${compareMode !== "none" ? "border-energy-blue bg-energy-blue/5 text-energy-blue" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {compareMode !== "none" ? "Compare: On" : "Compare"}
          </button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Avg Power" value={kpis.avg} unit="kW" icon={<BarChart3 className="w-4 h-4" />} colour={COLOURS.blue} loading={isLoading} />
        <KpiCard label="Peak Power" value={kpis.peak} unit="kW" colour={COLOURS.red} thresholds={{ warning: 4, danger: 6 }} loading={isLoading} />
        <KpiCard label="Total Energy" value={kpis.total} unit="kWh" colour={COLOURS.teal} loading={isLoading} />
        <KpiCard label="Est. Cost" value={kpis.cost} unit={currency} colour={COLOURS.green} loading={isLoading} />
      </div>

      {/* Time-series explorer — hidden at glance density */}
      {density !== "glance" && <div className="rounded-lg bg-card shadow-card p-5">
        <h3 className="text-section-heading text-foreground mb-4">Time-Series Explorer</h3>
        {isLoading && <LoadingOverlay message="Loading history..." />}
        {isError && <ErrorFallback title="History unavailable" message="Could not load data." onRetry={() => h0.refetch()} />}
        {!isLoading && !isError && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={380}>
            <LineChart data={chartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray} stroke={CHART_DEFAULTS.axisStroke} opacity={CHART_DEFAULTS.gridOpacity} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} />
              <YAxis tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} label={{ value: "kW", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
              <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: CHART_DEFAULTS.tooltipRadius, fontSize: 12 }} />
              <Legend iconType="line" iconSize={16} wrapperStyle={{ fontSize: 12 }} />
              {activeMeters.map((meter, i) => (
                <Line key={meter} dataKey={meter} name={METER_LABELS[meter]} stroke={CHART_COLOUR_SEQUENCE[i]} strokeWidth={1.5} dot={false} connectNulls />
              ))}
              <Brush dataKey="label" height={28} stroke={COLOURS.blue} travellerWidth={8} />
            </LineChart>
          </ResponsiveContainer>
        )}
        {!isLoading && !isError && chartData.length === 0 && (
          <p className="text-small text-muted-foreground text-center py-12">No data available for the selected range.</p>
        )}
      </div>}

      {/* Expandable sections — deep dive only */}
      {density === "deep_dive" && <>
        {apiGranularity === "hour" && heatmapData.length > 0 && (
          <Section title="Demand Heatmap" defaultOpen>
            <Heatmap data={heatmapData} height={Math.min(500, heatmapData.length / 24 * 8 + 60)} />
          </Section>
        )}

        {apiGranularity === "hour" && boxPlotData.length > 0 && (
          <Section title="Distribution by Hour">
            <BoxPlotPanel data={boxPlotData} unit="kW" height={320} />
          </Section>
        )}

        {decomposition.data && (
          <Section title="Seasonal Decomposition">
            {decomposition.isLoading && <LoadingOverlay message="Computing STL..." />}
            {decomposition.isError && <ErrorFallback title="Decomposition failed" onRetry={() => decomposition.refetch()} />}
            {decomposition.data && <DecompositionPanel data={decomposition.data} height={420} />}
          </Section>
        )}

        {costData.length > 0 && (
          <Section title="Cost Breakdown by TOU Tier">
            <CostBreakdown data={costData} height={300} currency={currency} />
          </Section>
        )}
      </>}
    </div>
  );
}
