import { COLOURS } from "@/theme/chartTheme";

interface BoxPlotData {
  label: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
}

interface BoxPlotPanelProps {
  data: BoxPlotData[];
  unit?: string;
  height?: number;
}

export default function BoxPlotPanel({ data, unit = "kW", height = 240 }: BoxPlotPanelProps) {
  const allMin = Math.min(...data.map((d) => d.min));
  const allMax = Math.max(...data.map((d) => d.max));
  const range = allMax - allMin || 1;

  function scale(v: number) {
    return ((v - allMin) / range) * 100;
  }

  const boxH = Math.max(24, (height - 40) / data.length);

  return (
    <div style={{ minHeight: height }}>
      {/* Scale labels */}
      <div className="flex justify-between mb-2 px-28 text-[10px] text-muted-foreground">
        <span>{allMin.toFixed(1)} {unit}</span>
        <span>{allMax.toFixed(1)} {unit}</span>
      </div>

      {data.map((d) => (
        <div key={d.label} className="flex items-center" style={{ height: boxH }}>
          <span className="w-24 pr-2 text-right text-small text-muted-foreground truncate shrink-0">
            {d.label}
          </span>
          <div className="relative flex-1 h-5">
            {/* Whisker line */}
            <div
              className="absolute top-1/2 h-px bg-muted-foreground/40"
              style={{ left: `${scale(d.min)}%`, width: `${scale(d.max) - scale(d.min)}%` }}
            />
            {/* Min/Max caps */}
            <div className="absolute top-1/4 w-px h-1/2 bg-muted-foreground/40" style={{ left: `${scale(d.min)}%` }} />
            <div className="absolute top-1/4 w-px h-1/2 bg-muted-foreground/40" style={{ left: `${scale(d.max)}%` }} />
            {/* Box */}
            <div
              className="absolute top-0.5 bottom-0.5 rounded-sm border"
              style={{
                left: `${scale(d.q1)}%`,
                width: `${scale(d.q3) - scale(d.q1)}%`,
                backgroundColor: `${COLOURS.blue}20`,
                borderColor: `${COLOURS.blue}60`,
              }}
            />
            {/* Median */}
            <div
              className="absolute top-0 bottom-0 w-0.5 rounded-full"
              style={{ left: `${scale(d.median)}%`, backgroundColor: COLOURS.blue }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
