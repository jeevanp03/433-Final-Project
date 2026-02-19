import type { OutcomeDist } from "@/types/api";

interface OutcomeCardProps {
  label: string;
  dist: OutcomeDist;
  unit: string;
  baseline?: number;
  colour?: string;
}

export default function OutcomeCard({
  label,
  dist,
  unit,
  baseline,
  colour = "var(--chart-1)",
}: OutcomeCardProps) {
  const delta = baseline !== undefined ? dist.mean - baseline : undefined;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-small text-muted-foreground mb-2">{label}</p>

      <div className="flex items-baseline gap-1.5 mb-1">
        <span className="text-section-heading text-foreground">{dist.mean.toFixed(2)}</span>
        <span className="text-small text-muted-foreground">{unit}</span>
      </div>

      {/* Range bar */}
      <div className="relative h-2 rounded-full bg-muted my-2">
        <div
          className="absolute h-2 rounded-full opacity-80"
          style={{
            left: `${((dist.p5 - dist.p5) / (dist.p95 - dist.p5 || 1)) * 100}%`,
            right: `${100 - ((dist.p95 - dist.p5) / (dist.p95 - dist.p5 || 1)) * 100}%`,
            backgroundColor: colour,
          }}
        />
        {/* Mean marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-card border-2 shadow-sm"
          style={{
            left: `${((dist.mean - dist.p5) / (dist.p95 - dist.p5 || 1)) * 100}%`,
            borderColor: colour,
          }}
        />
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>P5: {dist.p5.toFixed(1)}</span>
        <span>P95: {dist.p95.toFixed(1)}</span>
      </div>

      {delta !== undefined && (
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={`text-small font-medium ${
              delta <= 0 ? "text-energy-green" : "text-energy-red"
            }`}
          >
            {delta > 0 ? "+" : ""}{delta.toFixed(2)} {unit}
          </span>
          <span className="text-small text-muted-foreground">vs baseline</span>
        </div>
      )}
    </div>
  );
}
