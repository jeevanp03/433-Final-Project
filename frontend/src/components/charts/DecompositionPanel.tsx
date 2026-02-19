import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";
import type { DecompositionResponse } from "@/types/api";
import { format, parseISO } from "date-fns";

interface DecompositionPanelProps {
  data: DecompositionResponse;
  height?: number;
}

export default function DecompositionPanel({ data, height = 400 }: DecompositionPanelProps) {
  const chartData = data.timestamps.map((ts, i) => ({
    time: format(parseISO(ts), "MMM d"),
    trend: data.trend[i],
    seasonal: data.seasonal[i],
    residual: data.residual[i],
  }));

  const panelH = Math.floor((height - 16) / 3);
  const series: { key: string; label: string; colour: string }[] = [
    { key: "trend", label: "Trend", colour: COLOURS.blue },
    { key: "seasonal", label: "Seasonal", colour: COLOURS.teal },
    { key: "residual", label: "Residual", colour: COLOURS.orange },
  ];

  return (
    <div className="space-y-2">
      {series.map(({ key, label, colour }) => (
        <div key={key}>
          <p className="text-small text-muted-foreground mb-1">{label}</p>
          <ResponsiveContainer width="100%" height={panelH}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid
                strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
                stroke={CHART_DEFAULTS.axisStroke}
                opacity={CHART_DEFAULTS.gridOpacity}
              />
              <XAxis dataKey="time" tick={{ fontSize: 9 }} stroke={CHART_DEFAULTS.axisStroke} />
              <YAxis tick={{ fontSize: 9 }} stroke={CHART_DEFAULTS.axisStroke} width={40} />
              <Tooltip
                contentStyle={{
                  backgroundColor: CHART_DEFAULTS.tooltipBg,
                  border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`,
                  borderRadius: CHART_DEFAULTS.tooltipRadius,
                  fontSize: 11,
                }}
              />
              <Line dataKey={key} stroke={colour} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
