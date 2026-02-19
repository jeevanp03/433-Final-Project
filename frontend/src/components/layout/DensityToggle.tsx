import { useUIStore, type DensityLevel } from "@/stores/useUIStore";

const levels: { value: DensityLevel; label: string }[] = [
  { value: "glance", label: "Glance" },
  { value: "explore", label: "Explore" },
  { value: "deep_dive", label: "Detail" },
];

export default function DensityToggle() {
  const { density, setDensity } = useUIStore();

  return (
    <div className="inline-flex items-center bg-muted/60 rounded-md p-0.5" role="radiogroup" aria-label="Density level">
      {levels.map(({ value, label }) => (
        <button
          key={value}
          role="radio"
          aria-checked={density === value}
          onClick={() => setDensity(value)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded transition-all cursor-pointer ${
            density === value
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
