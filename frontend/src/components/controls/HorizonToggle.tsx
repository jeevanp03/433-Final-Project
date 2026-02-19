import { useForecastStore, type Horizon } from "@/stores/useForecastStore";

const horizons: { value: Horizon; label: string }[] = [
  { value: "6h", label: "6h" },
  { value: "12h", label: "12h" },
  { value: "24h", label: "24h" },
  { value: "48h", label: "48h" },
  { value: "7d", label: "7d" },
  { value: "14d", label: "14d" },
];

export default function HorizonToggle() {
  const { horizon, setHorizon } = useForecastStore();

  return (
    <div className="inline-flex items-center bg-muted rounded-lg p-0.5" role="radiogroup" aria-label="Forecast horizon">
      {horizons.map(({ value, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={horizon === value}
          onClick={() => setHorizon(value)}
          className={`px-2.5 py-1.5 text-small font-medium rounded-md transition-all cursor-pointer ${
            horizon === value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
