import { useMemo, useState } from "react";
import { COLOURS } from "@/theme/chartTheme";

interface HeatmapProps {
  data: { date: string; hour: number; value: number }[];
  onCellClick?: (date: string, hour: number) => void;
  height?: number;
  colourScale?: [string, string, string];
}

function interpolateColour(value: number, min: number, max: number, scale: [string, string, string]) {
  const t = max === min ? 0.5 : (value - min) / (max - min);
  if (t < 0.5) {
    const ratio = t * 2;
    return blendHex(scale[0], scale[1], ratio);
  }
  const ratio = (t - 0.5) * 2;
  return blendHex(scale[1], scale[2], ratio);
}

function blendHex(a: string, b: string, t: number): string {
  const ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}

export default function Heatmap({
  data,
  onCellClick,
  height = 400,
  colourScale = ["#E8F5E9", "#FFF9C4", COLOURS.red],
}: HeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ date: string; hour: number; value: number } | null>(null);

  const { dates, min, max, grid } = useMemo(() => {
    const dateSet = new Set<string>();
    let min = Infinity, max = -Infinity;
    for (const d of data) {
      dateSet.add(d.date);
      if (d.value < min) min = d.value;
      if (d.value > max) max = d.value;
    }
    const dates = [...dateSet].sort();
    const grid = new Map<string, number>();
    for (const d of data) grid.set(`${d.date}-${d.hour}`, d.value);
    return { dates, min, max, grid };
  }, [data]);

  const cellH = Math.max(3, Math.min(20, (height - 40) / dates.length));

  return (
    <div className="relative" style={{ height }}>
      {/* Hour labels */}
      <div className="flex pl-20 mb-1">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
            {h % 3 === 0 ? `${h}` : ""}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="overflow-y-auto" style={{ maxHeight: height - 40 }}>
        {dates.map((date) => (
          <div key={date} className="flex items-center">
            <div className="w-20 pr-2 text-right text-[10px] text-muted-foreground truncate shrink-0">
              {date}
            </div>
            <div className="flex flex-1">
              {Array.from({ length: 24 }, (_, h) => {
                const value = grid.get(`${date}-${h}`) ?? 0;
                const bg = interpolateColour(value, min, max, colourScale);
                return (
                  <div
                    key={h}
                    className="flex-1 cursor-pointer transition-opacity hover:opacity-80"
                    style={{ height: cellH, backgroundColor: bg }}
                    onClick={() => onCellClick?.(date, h)}
                    onMouseEnter={() => setHoveredCell({ date, hour: h, value })}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div className="absolute top-2 right-2 bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-small z-10 pointer-events-none">
          <p className="font-medium">{hoveredCell.date} @ {hoveredCell.hour}:00</p>
          <p className="text-muted-foreground">{hoveredCell.value.toFixed(2)} kW</p>
        </div>
      )}
    </div>
  );
}
