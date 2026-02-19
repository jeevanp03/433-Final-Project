import { Line, LineChart, ResponsiveContainer } from "recharts";
import { COLOURS } from "@/theme/chartTheme";

interface SparkLineProps {
  data: number[];
  colour?: string;
  height?: number;
  width?: number;
}

export default function SparkLine({
  data,
  colour = COLOURS.blue,
  height = 32,
  width = 100,
}: SparkLineProps) {
  const chartData = data.map((value, i) => ({ i, value }));

  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData}>
        <Line
          dataKey="value"
          stroke={colour}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
