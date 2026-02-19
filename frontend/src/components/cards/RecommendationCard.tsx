import {
  Clock,
  Check,
  X,
  Pause,
  ArrowRight,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Recommendation, RecoStatus } from "@/stores/useRecommendationStore";

const urgencyStyles: Record<string, string> = {
  high: "bg-energy-red/10 text-energy-red border-energy-red/20",
  medium: "bg-energy-orange/10 text-energy-orange border-energy-orange/20",
  low: "bg-energy-green/10 text-energy-green border-energy-green/20",
};

const statusBadge: Record<RecoStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-muted text-muted-foreground" },
  accepted: { label: "Accepted", className: "bg-energy-green/10 text-energy-green" },
  rejected: { label: "Rejected", className: "bg-energy-red/10 text-energy-red" },
  snoozed: { label: "Snoozed", className: "bg-energy-orange/10 text-energy-orange" },
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-all hover:shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-energy-blue/10 flex items-center justify-center">
            <Zap className="w-4.5 h-4.5 text-energy-blue" />
          </div>
          <div>
            <h4 className="text-card-title text-foreground">{reco.appliance}</h4>
            <div className="flex items-center gap-1.5 text-small text-muted-foreground">
              <span>{reco.shiftFrom}</span>
              <ArrowRight className="w-3 h-3" />
              <span>{reco.shiftTo}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full border ${urgencyStyles[reco.urgency]}`}>
            {reco.urgency}
          </span>
          <span className={`px-2 py-0.5 text-[11px] font-medium rounded-full ${badge.className}`}>
            {badge.label}
          </span>
        </div>
      </div>

      {/* Metrics */}
      {!compact && (
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <p className="text-small text-muted-foreground">Savings</p>
            <p className="text-card-title text-energy-green">{reco.savingsCost.toFixed(2)} EUR</p>
          </div>
          <div>
            <p className="text-small text-muted-foreground">Energy</p>
            <p className="text-card-title text-foreground">{reco.savingsKwh.toFixed(1)} kWh</p>
          </div>
          <div>
            <p className="text-small text-muted-foreground">Peak Cut</p>
            <p className="text-card-title text-energy-blue">{reco.peakReduction.toFixed(1)}%</p>
          </div>
        </div>
      )}

      {/* Explanation */}
      {!compact && reco.explanation && (
        <p className="text-small text-muted-foreground mb-3 line-clamp-2">
          {reco.explanation}
        </p>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex gap-2">
          {onAccept && (
            <ActionBtn icon={Check} label="Accept" onClick={() => onAccept(reco.id)} className="bg-energy-green/10 text-energy-green hover:bg-energy-green/20" />
          )}
          {onSnooze && (
            <ActionBtn icon={Pause} label="Snooze" onClick={() => onSnooze(reco.id)} className="bg-energy-orange/10 text-energy-orange hover:bg-energy-orange/20" />
          )}
          {onReject && (
            <ActionBtn icon={X} label="Reject" onClick={() => onReject(reco.id)} className="bg-energy-red/10 text-energy-red hover:bg-energy-red/20" />
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
      className={`flex items-center gap-1.5 px-3 py-1.5 text-small font-medium rounded-lg transition-colors cursor-pointer ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
