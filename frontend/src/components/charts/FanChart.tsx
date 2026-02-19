import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";

interface FanChartProps {
  data: {
    timestamp: string;
    median: number;
    p10: number;
    p25: number;
    p75: number;
    p90: number;
    baseline?: number;
  }[];
  height?: number;
  showBaseline?: boolean;
}

export default function FanChart({ data, height = 350, showBaseline = false }: FanChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke={CHART_DEFAULTS.axisStroke}
          opacity={CHART_DEFAULTS.gridOpacity}
        />
        <XAxis
          dataKey="timestamp"
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
        />
        <YAxis
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
          label={{ value: "kW", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`,
            borderRadius: CHART_DEFAULTS.tooltipRadius,
            fontSize: 12,
          }}
        />

        {/* 10-90th band */}
        <Area dataKey="p90" stroke="none" fill={COLOURS.blue} fillOpacity={0.08} name="P90" />
        <Area dataKey="p10" stroke="none" fill="white" fillOpacity={1} name="P10" />

        {/* 25-75th band */}
        <Area dataKey="p75" stroke="none" fill={COLOURS.blue} fillOpacity={0.15} name="P75" />
        <Area dataKey="p25" stroke="none" fill="white" fillOpacity={1} name="P25" />

        {/* Median */}
        <Line dataKey="median" stroke={COLOURS.blue} strokeWidth={2} dot={false} name="Median" />

        {/* Baseline overlay */}
        {showBaseline && (
          <Line
            dataKey="baseline"
            stroke={COLOURS.navy}
            strokeWidth={1.5}
            strokeDasharray="6 3"
            dot={false}
            name="Baseline"
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
