import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from "recharts";
import {
  Zap, TrendingDown, CheckCircle, Trash2, RefreshCw, SlidersHorizontal,
  ChevronDown, ChevronRight, Calendar,
} from "lucide-react";

import KpiCard from "@/components/cards/KpiCard";
import RecommendationCard from "@/components/cards/RecommendationCard";
import TimelineGantt from "@/components/charts/TimelineGantt";
import ConstraintSliders from "@/components/controls/ConstraintSliders";
import LoadingOverlay from "@/components/ui/LoadingOverlay";
import ErrorFallback from "@/components/ui/ErrorFallback";
import EmptyState from "@/components/ui/EmptyState";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";

import { useDefaultRecommendations, useRecommendations } from "@/api/hooks";
import { useRecommendationStore, type Recommendation, type ScheduleBlock } from "@/stores/useRecommendationStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import type { ScheduleEntry, RecommendResponse } from "@/types/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function apiToReco(entry: ScheduleEntry, index: number): Recommendation {
  return {
    id: `reco-${index}-${entry.appliance}`,
    appliance: entry.appliance,
    applianceIcon: "zap",
    shiftFrom: `${entry.start_hour}:00`,
    shiftTo: `${entry.start_hour + entry.duration_h}:00`,
    savingsKwh: entry.power_kw * entry.duration_h,
    savingsCost: entry.savings_cost,
    peakReduction: 0,
    urgency: entry.savings_cost > 0.3 ? "high" : entry.savings_cost > 0.1 ? "medium" : "low",
    explanation: entry.shift_description,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
}

function apiToScheduleBlocks(entries: ScheduleEntry[]): ScheduleBlock[] {
  return entries.map((entry, i) => ({
    id: `block-${i}-${entry.appliance}`,
    appliance: entry.appliance,
    startHour: entry.start_hour,
    endHour: entry.start_hour + entry.duration_h,
    powerKw: entry.power_kw,
    isFlexible: true,
    allowedWindow: [0, 24] as [number, number],
  }));
}

// ---------------------------------------------------------------------------
// Filter tabs
// ---------------------------------------------------------------------------

type FilterTab = "all" | "pending" | "accepted" | "rejected" | "snoozed";

const FILTER_TABS: { value: FilterTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "rejected", label: "Rejected" },
  { value: "snoozed", label: "Snoozed" },
];

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card">
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full px-5 py-3 text-left cursor-pointer">
        <h3 className="text-section-heading text-foreground">{title}</h3>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm dialog
// ---------------------------------------------------------------------------

function ConfirmDialog({ open, title, message, onConfirm, onCancel }: {
  open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-card border border-border rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <h3 className="text-section-heading text-foreground mb-2">{title}</h3>
        <p className="text-small text-muted-foreground mb-5">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-small font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 text-small font-medium rounded-lg bg-energy-red text-white hover:bg-energy-red/90 transition-colors cursor-pointer">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function Actions() {
  const { queue, schedule, impactLog, setQueue, setSchedule, acceptReco, rejectReco, snoozeReco, updateScheduleBlock, clearHistory } = useRecommendationStore();
  const { currency } = useSettingsStore();

  const [filterTab, setFilterTab] = useState<FilterTab>("all");
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [constraints, setConstraints] = useState({ maxDeferralHours: 4, maxShiftsPerDay: 3, comfortPriority: 60, peakWeight: 50 });
  const [lastApiResponse, setLastApiResponse] = useState<RecommendResponse | null>(null);

  // Fetch default recommendations
  const defaultRecos = useDefaultRecommendations();
  const recoMutation = useRecommendations();

  // Populate queue from API if queue is empty
  const displayQueue: Recommendation[] = useMemo(() => {
    if (queue.length > 0) return queue;
    const apiRecos = defaultRecos.data?.recommendations ?? [];
    return apiRecos.map(apiToReco);
  }, [queue, defaultRecos.data]);

  // Filtered queue
  const filteredQueue = useMemo(() => {
    if (filterTab === "all") return displayQueue;
    return displayQueue.filter((r) => r.status === filterTab);
  }, [displayQueue, filterTab]);

  // Schedule blocks from API or store
  const displaySchedule: ScheduleBlock[] = useMemo(() => {
    if (schedule.length > 0) return schedule;
    const apiRecos = lastApiResponse?.recommendations ?? defaultRecos.data?.recommendations ?? [];
    return apiToScheduleBlocks(apiRecos);
  }, [schedule, lastApiResponse, defaultRecos.data]);

  // KPI summaries
  const kpis = useMemo(() => {
    const accepted = displayQueue.filter((r) => r.status === "accepted");
    const totalSavings = accepted.reduce((s, r) => s + r.savingsCost, 0);
    const peakReduction = lastApiResponse?.peak_reduction_pct ?? (accepted.length > 0 ? accepted.reduce((s, r) => s + r.peakReduction, 0) / accepted.length : 0);
    return {
      totalSavings,
      peakReduction,
      acceptedCount: accepted.length,
      pendingCount: displayQueue.filter((r) => r.status === "pending").length,
    };
  }, [displayQueue, lastApiResponse]);

  // Baseline vs Optimised profile
  const profileData = useMemo(() => {
    const baseline = lastApiResponse?.baseline_profile ?? defaultRecos.data?.baseline_profile;
    const optimised = lastApiResponse?.optimised_profile ?? defaultRecos.data?.optimised_profile;
    if (!baseline || !optimised) return [];
    return baseline.map((b, i) => ({
      hour: `${i}:00`,
      baseline: b,
      optimised: optimised[i] ?? b,
    }));
  }, [lastApiResponse, defaultRecos.data]);

  // Impact log chart data
  const impactChartData = useMemo(() => {
    return impactLog.slice(-20).map((entry) => ({
      date: entry.date,
      predicted: entry.predictedSavings,
      actual: entry.actualSavings ?? 0,
    }));
  }, [impactLog]);

  // Handle fetching optimized recommendations
  function handleOptimize() {
    recoMutation.mutate(
      { peak_weight: constraints.peakWeight / 100 },
      {
        onSuccess: (data) => {
          setLastApiResponse(data);
          const recos = data.recommendations.map(apiToReco);
          // Set peak reduction from API response onto recommendations
          const withPeak = recos.map((r) => ({ ...r, peakReduction: data.peak_reduction_pct }));
          setQueue(withPeak);
          setSchedule(apiToScheduleBlocks(data.recommendations));
        },
      },
    );
  }

  // Handle accept — move to schedule
  function handleAccept(id: string) {
    if (queue.length === 0) {
      // First time — populate queue from display
      setQueue(displayQueue);
    }
    acceptReco(id);
  }

  function handleReject(id: string) {
    if (queue.length === 0) setQueue(displayQueue);
    rejectReco(id);
  }

  function handleSnooze(id: string) {
    if (queue.length === 0) setQueue(displayQueue);
    snoozeReco(id);
  }

  const isLoading = defaultRecos.isLoading || recoMutation.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-page-title text-foreground">Recommendations & Actions</h2>
        <p className="text-small text-muted-foreground mt-1">Review AI-generated load-shift recommendations, build your schedule, and track savings impact.</p>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Savings" value={kpis.totalSavings} unit={currency} icon={<TrendingDown className="w-4 h-4" />} colour={COLOURS.green} loading={isLoading} />
        <KpiCard label="Peak Reduction" value={kpis.peakReduction} unit="%" icon={<Zap className="w-4 h-4" />} colour={COLOURS.blue} loading={isLoading} />
        <KpiCard label="Accepted" value={kpis.acceptedCount} unit="" icon={<CheckCircle className="w-4 h-4" />} colour={COLOURS.teal} loading={isLoading} />
        <KpiCard label="Pending" value={kpis.pendingCount} unit="" icon={<Calendar className="w-4 h-4" />} colour={COLOURS.orange} loading={isLoading} />
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: Recommendation queue (2/3) */}
        <div className="xl:col-span-2 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-section-heading text-foreground">Recommendation Queue</h3>
              <button
                onClick={handleOptimize}
                disabled={recoMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-small font-medium rounded-lg bg-energy-blue text-white hover:bg-energy-blue/90 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${recoMutation.isPending ? "animate-spin" : ""}`} />
                {recoMutation.isPending ? "Optimizing..." : "Re-optimize"}
              </button>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 mb-4 p-1 bg-muted/30 rounded-lg w-fit">
              {FILTER_TABS.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setFilterTab(tab.value)}
                  className={`px-3 py-1 text-small font-medium rounded-md transition-colors cursor-pointer ${
                    filterTab === tab.value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.value !== "all" && (
                    <span className="ml-1 text-[10px]">
                      ({displayQueue.filter((r) => tab.value === "all" || r.status === tab.value).length})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {isLoading && <LoadingOverlay message="Loading recommendations..." />}
            {defaultRecos.isError && <ErrorFallback title="Recommendations unavailable" message="Could not load recommendations." onRetry={() => defaultRecos.refetch()} />}

            {!isLoading && !defaultRecos.isError && filteredQueue.length === 0 && (
              <EmptyState title="No recommendations" message={filterTab === "all" ? "Click Re-optimize to generate load-shift recommendations." : `No ${filterTab} recommendations.`} />
            )}

            {!isLoading && filteredQueue.length > 0 && (
              <div className="space-y-3">
                {filteredQueue.map((reco) => (
                  <RecommendationCard
                    key={reco.id}
                    reco={reco}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onSnooze={handleSnooze}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Constraints & Schedule (1/3) */}
        <div className="space-y-4">
          {/* Constraints */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <SlidersHorizontal className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-section-heading text-foreground">Constraints</h3>
            </div>
            <ConstraintSliders values={constraints} onChange={setConstraints} />
            <button
              onClick={handleOptimize}
              disabled={recoMutation.isPending}
              className="w-full mt-4 py-2 text-small font-medium rounded-lg border border-energy-blue text-energy-blue hover:bg-energy-blue/5 transition-colors cursor-pointer disabled:opacity-50"
            >
              Apply & Re-optimize
            </button>
          </div>

          {/* Schedule preview */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-section-heading text-foreground mb-4">Schedule Preview</h3>
            {displaySchedule.length === 0 ? (
              <EmptyState title="No schedule" message="Accept recommendations to build your schedule." />
            ) : (
              <TimelineGantt
                blocks={displaySchedule}
                onBlockChange={(id, startHour) => {
                  if (schedule.length === 0) setSchedule(displaySchedule);
                  const block = displaySchedule.find((b) => b.id === id);
                  if (block) {
                    updateScheduleBlock(id, { startHour, endHour: startHour + (block.endHour - block.startHour) });
                  }
                }}
                height={Math.max(160, displaySchedule.length * 44 + 30)}
              />
            )}
          </div>
        </div>
      </div>

      {/* Baseline vs Optimised profile */}
      {profileData.length > 0 && (
        <Section title="Baseline vs Optimised Profile" defaultOpen>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={profileData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray} stroke={CHART_DEFAULTS.axisStroke} opacity={CHART_DEFAULTS.gridOpacity} />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} />
              <YAxis tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} label={{ value: "kW", angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
              <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: CHART_DEFAULTS.tooltipRadius, fontSize: 12 }} />
              <Legend iconType="line" iconSize={16} wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="baseline" name="Baseline" stroke={COLOURS.red} strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
              <Line dataKey="optimised" name="Optimised" stroke={COLOURS.green} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Section>
      )}

      {/* Impact tracker */}
      <Section title="Impact Tracker">
        {impactLog.length === 0 ? (
          <EmptyState title="No impact data yet" message="Accept recommendations to start tracking savings impact over time." />
        ) : (
          <div className="space-y-4">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={impactChartData} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray} stroke={CHART_DEFAULTS.axisStroke} opacity={CHART_DEFAULTS.gridOpacity} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} />
                <YAxis tick={{ fontSize: 10 }} stroke={CHART_DEFAULTS.axisStroke} label={{ value: currency, angle: -90, position: "insideLeft", style: { fontSize: 11 } }} />
                <Tooltip contentStyle={{ backgroundColor: CHART_DEFAULTS.tooltipBg, border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`, borderRadius: CHART_DEFAULTS.tooltipRadius, fontSize: 12 }} />
                <Legend iconType="rect" iconSize={12} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="predicted" name="Predicted Savings" fill={COLOURS.blue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" name="Actual Savings" fill={COLOURS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Impact table */}
            <div className="overflow-x-auto">
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Date</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Appliance</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Predicted</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Actual</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {impactLog.slice(-10).reverse().map((entry, i) => {
                    const accuracy = entry.actualSavings != null && entry.predictedSavings > 0
                      ? ((entry.actualSavings / entry.predictedSavings) * 100)
                      : null;
                    return (
                      <tr key={`${entry.recoId}-${i}`} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-2 px-3 text-foreground">{entry.date}</td>
                        <td className="py-2 px-3 text-foreground">{entry.appliance}</td>
                        <td className="py-2 px-3 text-right text-energy-blue">{entry.predictedSavings.toFixed(2)} {currency}</td>
                        <td className="py-2 px-3 text-right text-energy-green">{entry.actualSavings != null ? `${entry.actualSavings.toFixed(2)} ${currency}` : "—"}</td>
                        <td className="py-2 px-3 text-right">{accuracy != null ? `${accuracy.toFixed(0)}%` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowClearDialog(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-small font-medium rounded-lg text-energy-red hover:bg-energy-red/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear History
              </button>
            </div>
          </div>
        )}
      </Section>

      <ConfirmDialog
        open={showClearDialog}
        title="Clear Impact History"
        message="This will permanently delete all impact tracking data. This action cannot be undone."
        onConfirm={() => { clearHistory(); setShowClearDialog(false); }}
        onCancel={() => setShowClearDialog(false)}
      />
    </div>
  );
}
