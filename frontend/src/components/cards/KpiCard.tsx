import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ReactNode } from "react";

interface KpiCardProps {
  label: string;
  value: number;
  unit: string;
  delta?: number;
  deltaLabel?: string;
  icon?: ReactNode;
  colour?: string;
  thresholds?: { warning: number; danger: number };
  onClick?: () => void;
  loading?: boolean;
}

function useAnimatedCounter(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef(0);

  useEffect(() => {
    const start = display;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) return;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(start + diff * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(tick);
    }

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  return display;
}

function formatValue(v: number): string {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

export default function KpiCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  icon,
  colour = "var(--chart-1)",
  thresholds,
  onClick,
  loading,
}: KpiCardProps) {
  const animated = useAnimatedCounter(value);

  const isWarning = thresholds && value >= thresholds.warning && value < thresholds.danger;
  const isDanger = thresholds && value >= thresholds.danger;
  const accentColor = isDanger ? "var(--color-energy-red)" : isWarning ? "var(--color-energy-orange)" : colour;

  const DeltaIcon = delta === undefined || delta === 0 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const deltaColor = delta === undefined || delta === 0
    ? "text-muted-foreground"
    : delta > 0
      ? "text-energy-red"
      : "text-energy-green";

  if (loading) {
    return (
      <div className="rounded-lg bg-card shadow-card p-4 animate-pulse">
        <div className="h-3 w-20 bg-muted rounded mb-3" />
        <div className="h-7 w-24 bg-muted rounded mb-2" />
        <div className="h-2 w-16 bg-muted rounded" />
      </div>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden rounded-lg bg-card shadow-card p-4 text-left transition-all w-full ${
        onClick ? "hover:shadow-card-hover cursor-pointer" : ""
      }`}
    >
      {/* Left accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px]"
        style={{ backgroundColor: accentColor }}
      />

      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        {icon && (
          <span className="opacity-40" style={{ color: accentColor }}>{icon}</span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5">
        <span className="text-kpi text-foreground">{formatValue(animated)}</span>
        <span className="text-[11px] text-muted-foreground font-medium">{unit}</span>
      </div>

      {delta !== undefined && (
        <div className={`flex items-center gap-1 mt-1.5 ${deltaColor}`}>
          <DeltaIcon className="w-3 h-3" />
          <span className="text-[11px] font-medium">
            {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
          </span>
          {deltaLabel && (
            <span className="text-[11px] text-muted-foreground ml-0.5">{deltaLabel}</span>
          )}
        </div>
      )}
    </button>
  );
}
