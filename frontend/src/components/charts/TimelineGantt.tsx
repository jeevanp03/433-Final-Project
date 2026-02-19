import { CHART_COLOUR_SEQUENCE } from "@/theme/chartTheme";
import type { ScheduleBlock } from "@/stores/useRecommendationStore";

interface TimelineGanttProps {
  blocks: ScheduleBlock[];
  onBlockChange?: (id: string, startHour: number) => void;
  height?: number;
}

export default function TimelineGantt({ blocks, onBlockChange, height = 200 }: TimelineGanttProps) {
  const rowH = Math.max(32, (height - 30) / Math.max(blocks.length, 1));

  function handleDrag(id: string, e: React.MouseEvent<HTMLDivElement>) {
    if (!onBlockChange) return;
    const row = e.currentTarget.parentElement;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    const startX = e.clientX;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const hourDelta = Math.round((dx / rect.width) * 24);
      const block = blocks.find((b) => b.id === id);
      if (block) {
        const newStart = Math.max(0, Math.min(23, block.startHour + hourDelta));
        onBlockChange!(id, newStart);
      }
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <div style={{ height }}>
      {/* Hour labels */}
      <div className="flex mb-1 pl-24">
        {Array.from({ length: 25 }, (_, h) => (
          <div key={h} className="flex-1 text-[9px] text-muted-foreground text-center">
            {h % 3 === 0 ? `${h}:00` : ""}
          </div>
        ))}
      </div>

      {/* Rows */}
      {blocks.map((block, i) => {
        const widthPct = ((block.endHour - block.startHour) / 24) * 100;
        const leftPct = (block.startHour / 24) * 100;
        const colour = CHART_COLOUR_SEQUENCE[i % CHART_COLOUR_SEQUENCE.length];

        return (
          <div key={block.id} className="flex items-center" style={{ height: rowH }}>
            <div className="w-24 pr-2 text-right text-small text-muted-foreground truncate shrink-0">
              {block.appliance}
            </div>
            <div className="relative flex-1 h-6 bg-muted/30 rounded">
              {/* Allowed window indicator */}
              {block.isFlexible && (
                <div
                  className="absolute inset-y-0 bg-energy-green/5 border-x border-energy-green/20"
                  style={{
                    left: `${(block.allowedWindow[0] / 24) * 100}%`,
                    width: `${((block.allowedWindow[1] - block.allowedWindow[0]) / 24) * 100}%`,
                  }}
                />
              )}
              {/* Block */}
              <div
                onMouseDown={(e) => handleDrag(block.id, e)}
                className={`absolute inset-y-0.5 rounded flex items-center justify-center text-[10px] text-white font-medium ${
                  onBlockChange ? "cursor-grab active:cursor-grabbing" : ""
                }`}
                style={{
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  backgroundColor: colour,
                  minWidth: 24,
                }}
              >
                {block.powerKw.toFixed(1)} kW
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
