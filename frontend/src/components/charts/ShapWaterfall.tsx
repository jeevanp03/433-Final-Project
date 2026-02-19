import { COLOURS } from "@/theme/chartTheme";
import type { ShapDriver } from "@/types/api";

interface ShapWaterfallProps {
  drivers: ShapDriver[];
  maxBars?: number;
  height?: number;
}

export default function ShapWaterfall({ drivers, maxBars = 8, height = 280 }: ShapWaterfallProps) {
  const sorted = [...drivers]
    .sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value))
    .slice(0, maxBars);

  const maxAbs = Math.max(...sorted.map((d) => Math.abs(d.shap_value)), 0.01);
  const barH = Math.max(24, (height - 16) / sorted.length);

  return (
    <div className="space-y-1" style={{ minHeight: height }} role="img" aria-label={`SHAP waterfall chart showing top ${sorted.length} feature contributions to forecast`}>
      {sorted.map((d) => {
        const pct = (Math.abs(d.shap_value) / maxAbs) * 100;
        const isPositive = d.shap_value > 0;
        const colour = isPositive ? COLOURS.red : COLOURS.blue;

        return (
          <div key={d.feature} className="flex items-center gap-2" style={{ height: barH }}>
            <span className="w-32 text-right text-small text-muted-foreground truncate shrink-0">
              {d.feature}
            </span>
            <div className="flex-1 relative h-4">
              <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
              <div
                className="absolute top-0 h-full rounded-sm transition-all"
                style={{
                  width: `${pct / 2}%`,
                  backgroundColor: colour,
                  opacity: 0.7,
                  ...(isPositive
                    ? { left: "50%" }
                    : { right: "50%" }),
                }}
              />
            </div>
            <span className={`w-14 text-right text-small font-medium ${isPositive ? "text-energy-red" : "text-energy-blue"}`}>
              {d.shap_value > 0 ? "+" : ""}{d.shap_value.toFixed(3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
