import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from "recharts";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";
import type { SensitivityBar } from "@/types/api";

interface TornadoChartProps {
  bars: SensitivityBar[];
  baselineValue: number;
  metric: string;
  height?: number;
}

export default function TornadoChart({ bars, baselineValue, metric, height = 300 }: TornadoChartProps) {
  const sorted = [...bars].sort(
    (a, b) => Math.abs(b.high_outcome - b.low_outcome) - Math.abs(a.high_outcome - a.low_outcome)
  );

  const data = sorted.map((bar) => ({
    name: bar.parameter,
    low: bar.low_outcome - baselineValue,
    high: bar.high_outcome - baselineValue,
    lowLabel: bar.low_value.toFixed(1),
    highLabel: bar.high_value.toFixed(1),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 100 }}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke={CHART_DEFAULTS.axisStroke}
          opacity={CHART_DEFAULTS.gridOpacity}
          horizontal={false}
        />
        <XAxis
          type="number"
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
          label={{ value: `Change in ${metric}`, position: "insideBottom", offset: -4, style: { fontSize: 11 } }}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
          width={90}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`,
            borderRadius: CHART_DEFAULTS.tooltipRadius,
            fontSize: 12,
          }}
        />
        <ReferenceLine x={0} stroke={COLOURS.navy} strokeWidth={1.5} />
        <Bar dataKey="low" stackId="tornado" name="Low scenario">
          {data.map((d, i) => (
            <Cell key={i} fill={d.low < 0 ? COLOURS.green : COLOURS.red} fillOpacity={0.7} />
          ))}
        </Bar>
        <Bar dataKey="high" stackId="tornado" name="High scenario">
          {data.map((d, i) => (
            <Cell key={i} fill={d.high > 0 ? COLOURS.red : COLOURS.green} fillOpacity={0.7} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
