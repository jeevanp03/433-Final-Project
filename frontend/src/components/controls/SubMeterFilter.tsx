type SubMeter = "total" | "sub1" | "sub2" | "sub3" | "other";

interface SubMeterFilterProps {
  selected: SubMeter[];
  onChange: (meters: SubMeter[]) => void;
}

const meters: { id: SubMeter; label: string; colour: string }[] = [
  { id: "total", label: "Total", colour: "bg-energy-blue" },
  { id: "sub1", label: "Kitchen", colour: "bg-energy-orange" },
  { id: "sub2", label: "Laundry", colour: "bg-energy-teal" },
  { id: "sub3", label: "Water Heater/AC", colour: "bg-energy-red" },
  { id: "other", label: "Other", colour: "bg-energy-purple" },
];

export default function SubMeterFilter({ selected, onChange }: SubMeterFilterProps) {
  function toggle(id: SubMeter) {
    if (selected.includes(id)) {
      if (selected.length > 1) onChange(selected.filter((m) => m !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sub-meter filter">
      {meters.map(({ id, label, colour }) => {
        const active = selected.includes(id);
        return (
          <button
            key={id}
            role="checkbox"
            aria-checked={active}
            onClick={() => toggle(id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-small font-medium rounded-lg border transition-all cursor-pointer ${
              active
                ? "border-energy-blue/40 bg-card text-foreground shadow-sm"
                : "border-transparent bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${colour} ${active ? "opacity-100" : "opacity-40"}`} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
