import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis } from "recharts";
import { COLOURS, CHART_DEFAULTS, CHART_COLOUR_SEQUENCE } from "@/theme/chartTheme";

interface ScenarioPoint {
  name: string;
  cost: number;
  peak: number;
  costStd?: number;
  peakStd?: number;
}

interface ParetoScatterProps {
  scenarios: ScenarioPoint[];
  height?: number;
}

export default function ParetoScatter({ scenarios, height = 300 }: ParetoScatterProps) {
  const data = scenarios.map((s, i) => ({
    ...s,
    fill: CHART_COLOUR_SEQUENCE[i % CHART_COLOUR_SEQUENCE.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke={CHART_DEFAULTS.axisStroke}
          opacity={CHART_DEFAULTS.gridOpacity}
        />
        <XAxis
          dataKey="cost"
          type="number"
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
          name="Cost"
          label={{ value: "Daily Cost (EUR)", position: "insideBottom", offset: -4, style: { fontSize: 11 } }}
        />
        <YAxis
          dataKey="peak"
          type="number"
          tick={{ fontSize: CHART_DEFAULTS.axisTickSize }}
          stroke={CHART_DEFAULTS.axisStroke}
          name="Peak"
          label={{ value: "Peak kW", angle: -90, position: "insideLeft", style: { fontSize: 11 } }}
        />
        <ZAxis range={[60, 60]} />
        <Tooltip
          contentStyle={{
            backgroundColor: CHART_DEFAULTS.tooltipBg,
            border: `1px solid ${CHART_DEFAULTS.tooltipBorder}`,
            borderRadius: CHART_DEFAULTS.tooltipRadius,
            fontSize: 12,
          }}
          formatter={(val: number, name: string) => [val.toFixed(2), name]}
          labelFormatter={(_, payload) => payload[0]?.payload?.name ?? ""}
        />
        <Scatter data={data} fill={COLOURS.blue} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
