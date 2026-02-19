import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";

interface CostBreakdownProps {
  data: { period: string; offPeak: number; midPeak: number; onPeak: number }[];
  height?: number;
  currency?: string;
}

export default function CostBreakdown({ data, height = 300, currency = "EUR" }: CostBreakdownProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke={CHART_DEFAULTS.axisStroke}
          opacity={CHART_DEFAULTS.gridOpacity}
        />
        <XAxis
          dataKey="period"
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
        />
        <YAxis
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
          label={{ value: currency, angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`,
            borderRadius: CHART_DEFAULTS.tooltipRadius,
            fontSize: 12,
          }}
          formatter={(value) => [`${Number(value).toFixed(2)} ${currency}`, undefined]}
        />
        <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="offPeak" name="Off-Peak" stackId="cost" fill={COLOURS.green} radius={[0, 0, 0, 0]} />
        <Bar dataKey="midPeak" name="Mid-Peak" stackId="cost" fill={COLOURS.orange} />
        <Bar dataKey="onPeak" name="On-Peak" stackId="cost" fill={COLOURS.red} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
