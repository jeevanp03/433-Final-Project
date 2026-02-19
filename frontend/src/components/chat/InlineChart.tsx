import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { COLOURS } from "@/theme/chartTheme";

interface DataPoint {
  label: string;
  value: number;
  upper?: number;
  lower?: number;
}

interface InlineChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  showBands?: boolean;
}

export default function InlineChart({
  data,
  height = 120,
  color = COLOURS.blue,
  showBands = false,
}: InlineChartProps) {
  return (
    <div className="my-2 rounded-md border border-border bg-background p-2">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={["auto", "auto"]} />
          <Tooltip
            contentStyle={{
              fontSize: 11,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
            }}
          />
          {showBands && (
            <Area
              dataKey="upper"
              stroke="none"
              fill={color}
              fillOpacity={0.1}
              isAnimationActive={false}
            />
          )}
          {showBands && (
            <Area
              dataKey="lower"
              stroke="none"
              fill="var(--background)"
              fillOpacity={1}
              isAnimationActive={false}
            />
          )}
          <Area
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.15}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
