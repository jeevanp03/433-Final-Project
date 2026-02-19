type Granularity = "minute" | "hour" | "day" | "week" | "month";

interface GranularityToggleProps {
  value: Granularity;
  onChange: (g: Granularity) => void;
  available?: Granularity[];
}

const allGranularities: { value: Granularity; label: string }[] = [
  { value: "minute", label: "Min" },
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

export default function GranularityToggle({
  value,
  onChange,
  available,
}: GranularityToggleProps) {
  const items = available
    ? allGranularities.filter((g) => available.includes(g.value))
    : allGranularities;

  return (
    <div className="inline-flex items-center bg-muted rounded-lg p-0.5" role="radiogroup" aria-label="Granularity">
      {items.map((g) => (
        <button
          key={g.value}
          role="radio"
          aria-checked={value === g.value}
          onClick={() => onChange(g.value)}
          className={`px-2.5 py-1.5 text-small font-medium rounded-md transition-all cursor-pointer ${
            value === g.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
