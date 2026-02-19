interface DistributionCardProps {
  label: string;
  mean: number;
  std: number;
  unit: string;
  baselineMean?: number;
  bins?: number[];
  className?: string;
}

function MiniHistogram({ bins }: { bins: number[] }) {
  const max = Math.max(...bins, 1);
  return (
    <div className="flex items-end gap-px h-10">
      {bins.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-energy-blue/60 rounded-t-sm min-w-[3px]"
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

export default function DistributionCard({
  label,
  mean,
  std,
  unit,
  baselineMean,
  bins,
  className = "",
}: DistributionCardProps) {
  const delta = baselineMean !== undefined ? mean - baselineMean : undefined;
  const deltaPct = baselineMean && baselineMean !== 0 ? ((delta ?? 0) / baselineMean) * 100 : undefined;

  return (
    <div className={`rounded-lg bg-card shadow-card p-4 ${className}`}>
      <p className="text-small text-muted-foreground mb-2">{label}</p>

      {bins && <MiniHistogram bins={bins} />}

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-section-heading text-foreground">{mean.toFixed(2)}</span>
        <span className="text-small text-muted-foreground">{unit}</span>
      </div>

      <p className="text-small text-muted-foreground">
        std: {std.toFixed(2)} {unit}
      </p>

      {delta !== undefined && (
        <span
          className={`inline-block mt-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full ${
            delta <= 0
              ? "bg-energy-green/10 text-energy-green"
              : "bg-energy-red/10 text-energy-red"
          }`}
        >
          {delta > 0 ? "+" : ""}{delta.toFixed(2)} {unit}
          {deltaPct !== undefined && ` (${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}%)`}
        </span>
      )}
    </div>
  );
}
