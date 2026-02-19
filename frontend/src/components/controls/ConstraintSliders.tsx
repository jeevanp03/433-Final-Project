interface ConstraintValues {
  maxDeferralHours: number;
  maxShiftsPerDay: number;
  comfortPriority: number;
  peakWeight: number;
}

interface ConstraintSlidersProps {
  values: ConstraintValues;
  onChange: (values: ConstraintValues) => void;
}

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}

function SliderRow({ label, value, min, max, step, unit, onChange }: SliderRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-small text-muted-foreground">{label}</span>
        <span className="text-card-title text-foreground">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer accent-energy-blue
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
          [&::-webkit-slider-thumb]:bg-energy-blue [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-sm"
      />
    </div>
  );
}

export default function ConstraintSliders({ values, onChange }: ConstraintSlidersProps) {
  function update(key: keyof ConstraintValues, v: number) {
    onChange({ ...values, [key]: v });
  }

  return (
    <div className="space-y-4">
      <SliderRow label="Max deferral" value={values.maxDeferralHours} min={0} max={12} step={1} unit="h" onChange={(v) => update("maxDeferralHours", v)} />
      <SliderRow label="Max shifts/day" value={values.maxShiftsPerDay} min={1} max={8} step={1} unit="" onChange={(v) => update("maxShiftsPerDay", v)} />
      <SliderRow label="Comfort priority" value={values.comfortPriority} min={0} max={100} step={5} unit="%" onChange={(v) => update("comfortPriority", v)} />
      <SliderRow label="Peak weight" value={values.peakWeight} min={0} max={100} step={5} unit="%" onChange={(v) => update("peakWeight", v)} />
    </div>
  );
}
