import {
  Check,
  X,
  Pause,
  ArrowRight,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Recommendation, RecoStatus } from "@/stores/useRecommendationStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

const urgencyStyles: Record<string, string> = {
  high: "bg-energy-red/8 text-energy-red border-energy-red/15",
  medium: "bg-energy-orange/8 text-energy-orange border-energy-orange/15",
  low: "bg-energy-green/8 text-energy-green border-energy-green/15",
};

const statusBadge: Record<RecoStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  accepted: { label: "Accepted", className: "bg-energy-green/8 text-energy-green" },
  rejected: { label: "Rejected", className: "bg-energy-red/8 text-energy-red" },
  snoozed: { label: "Snoozed", className: "bg-energy-orange/8 text-energy-orange" },
};

interface RecommendationCardProps {
  reco: Recommendation;
  onAccept?: (id: string) => void;
  onReject?: (id: string) => void;
  onSnooze?: (id: string) => void;
  compact?: boolean;
}

export default function RecommendationCard({
  reco,
  onAccept,
  onReject,
  onSnooze,
  compact = false,
}: RecommendationCardProps) {
  const badge = statusBadge[reco.status];
  const isPending = reco.status === "pending";
  const currency = useSettingsStore((s) => s.currency);

  return (
    <div className="rounded-lg bg-card shadow-card p-4 transition-all hover:shadow-card-hover">
      {/* Header */}
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-energy-blue/8 flex items-center justify-center">
            <Zap className="w-4 h-4 text-energy-blue" />
          </div>
          <div>
            <h4 className="text-[13px] font-semibold text-foreground">{reco.appliance}</h4>
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <span>{reco.shiftFrom}</span>
              <ArrowRight className="w-2.5 h-2.5" />
              <span>{reco.shiftTo}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${urgencyStyles[reco.urgency]}`}>
            {reco.urgency}
          </span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${badge.className}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Metrics */}
      {!compact && (
        <div className="grid grid-cols-3 gap-2 mb-2.5">
          <div>
            <p className="text-[10px] text-muted-foreground">Savings</p>
            <p className="text-[13px] font-semibold text-energy-green tabular-nums">{reco.savingsCost.toFixed(2)} {currency}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Energy</p>
            <p className="text-[13px] font-semibold text-foreground tabular-nums">{reco.savingsKwh.toFixed(1)} kWh</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Peak Cut</p>
            <p className="text-[13px] font-semibold text-energy-blue tabular-nums">{reco.peakReduction.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Explanation */}
      {!compact && reco.explanation && (
        <p className="text-[11px] text-muted-foreground mb-2.5 line-clamp-2 leading-relaxed">
          {reco.explanation}
        </p>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-1.5">
          {onAccept && (
            <ActionBtn icon={Check} label="Accept" onClick={() => onAccept(reco.id)} className="bg-energy-green/8 text-energy-green hover:bg-energy-green/15" />
          )}
          {onSnooze && (
            <ActionBtn icon={Pause} label="Snooze" onClick={() => onSnooze(reco.id)} className="bg-energy-orange/8 text-energy-orange hover:bg-energy-orange/15" />
          )}
          {onReject && (
            <ActionBtn icon={X} label="Reject" onClick={() => onReject(reco.id)} className="bg-energy-red/8 text-energy-red hover:bg-energy-red/15" />
          )}
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  className: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${className}`}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
