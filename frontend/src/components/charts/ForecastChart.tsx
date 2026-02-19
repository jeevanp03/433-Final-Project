import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { COLOURS, CHART_DEFAULTS } from "@/theme/chartTheme";
import type { ForecastPoint } from "@/types/api";
import { format, parseISO } from "date-fns";

interface ForecastChartProps {
  points: ForecastPoint[];
  showConfidence?: boolean;
  touPricing?: { start: number; end: number; label: string; rate: number }[];
  peakThreshold?: number;
  height?: number;
  comparisonPoints?: { model: string; points: ForecastPoint[] }[];
}

const MODEL_COLOURS: Record<string, string> = {
  xgboost: COLOURS.blue,
  ridge: COLOURS.teal,
  naive: COLOURS.orange,
};

export default function ForecastChart({
  points,
  showConfidence = true,
  touPricing,
  peakThreshold,
  height = 400,
  comparisonPoints,
}: ForecastChartProps) {
  const data = points.map((p) => ({
    ...p,
    time: format(parseISO(p.timestamp), "HH:mm"),
    fullTime: format(parseISO(p.timestamp), "MMM d, HH:mm"),
  }));

  return (
    <div role="img" aria-label={`Forecast chart showing ${points.length} data points from ${data[0]?.fullTime ?? ''} to ${data[data.length - 1]?.fullTime ?? ''}`}>
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid
          strokeDasharray={CHART_DEFAULTS.gridStrokeDasharray}
          stroke={CHART_DEFAULTS.axisStroke}
          opacity={CHART_DEFAULTS.gridOpacity}
        />
        <XAxis
          dataKey="time"
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
          labelFormatter={(_, payload) => payload[0]?.payload?.fullTime ?? ""}
        />

        {/* TOU pricing zones */}
        {touPricing?.map((tier, i) => (
          <ReferenceArea
            key={i}
            x1={`${String(tier.start).padStart(2, "0")}:00`}
            x2={`${String(tier.end).padStart(2, "0")}:00`}
            fill={tier.label === "On-Peak" ? COLOURS.red : tier.label === "Mid-Peak" ? COLOURS.orange : COLOURS.green}
            fillOpacity={0.05}
          />
        ))}

        {/* Peak threshold */}
        {peakThreshold && (
          <ReferenceLine
            y={peakThreshold}
            stroke={COLOURS.red}
            strokeDasharray="6 3"
            label={{ value: "Peak threshold", fill: COLOURS.red, fontSize: 11 }}
          />
        )}

        {/* Confidence band */}
        {showConfidence && (
          <Area
            dataKey="upper"
            stroke="none"
            fill={COLOURS.blue}
            fillOpacity={0.1}
            isAnimationActive={false}
          />
        )}
        {showConfidence && (
          <Area
            dataKey="lower"
            stroke="none"
            fill="white"
            fillOpacity={1}
            isAnimationActive={false}
          />
        )}

        {/* Actual line */}
        <Line
          dataKey="actual"
          stroke={COLOURS.navy}
          strokeWidth={2}
          dot={false}
          connectNulls={false}
          animationDuration={CHART_DEFAULTS.animationDuration}
          name="Actual"
        />

        {/* Forecast line */}
        <Line
          dataKey="forecast"
          stroke={COLOURS.blue}
          strokeWidth={2}
          dot={false}
          strokeDasharray="6 3"
          animationDuration={CHART_DEFAULTS.animationDuration}
          name="Forecast"
        />

        {/* Comparison model overlays */}
        {comparisonPoints?.map(({ model, points: cPts }) => (
          <Line
            key={model}
            data={cPts.map((p) => ({
              time: format(parseISO(p.timestamp), "HH:mm"),
              [`forecast_${model}`]: p.forecast,
            }))}
            dataKey={`forecast_${model}`}
            stroke={MODEL_COLOURS[model] ?? COLOURS.purple}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            name={model}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
    </div>
  );
}
