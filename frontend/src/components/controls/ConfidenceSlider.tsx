import { useForecastStore } from "@/stores/useForecastStore";

export default function ConfidenceSlider() {
  const { confidence, setConfidence } = useForecastStore();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-small text-muted-foreground">Confidence level</label>
        <span className="text-card-title text-foreground">{confidence}%</span>
      </div>
      <input
        type="range"
        min={50}
        max={99}
        step={1}
        value={confidence}
        onChange={(e) => setConfidence(Number(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-energy-blue
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-energy-blue [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>50%</span>
        <span>99%</span>
      </div>
    </div>
  );
}
