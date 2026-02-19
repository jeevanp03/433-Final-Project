import { Plus, X, GripVertical } from "lucide-react";
import type { ScenarioBlockInput } from "@/types/api";

const blockTypes = [
  { type: "add_appliance", label: "Add Appliance", description: "Add a new load" },
  { type: "remove_appliance", label: "Remove Appliance", description: "Remove a load" },
  { type: "shift_load", label: "Shift Load", description: "Move to different hours" },
  { type: "scale", label: "Scale Usage", description: "Multiply by factor" },
  { type: "temperature", label: "Temperature Shock", description: "Heat wave / cold snap" },
  { type: "occupancy", label: "Occupancy Change", description: "More/fewer people" },
  { type: "price_change", label: "Price Change", description: "Modify TOU rates" },
  { type: "battery_solar", label: "Battery / Solar", description: "Add DER" },
];

interface ScenarioBuilderProps {
  blocks: ScenarioBlockInput[];
  onChange: (blocks: ScenarioBlockInput[]) => void;
}

export default function ScenarioBuilder({ blocks, onChange }: ScenarioBuilderProps) {
  function addBlock(type: string, label: string) {
    onChange([...blocks, { type, label, params: {} }]);
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {/* Active blocks */}
      {blocks.map((block, i) => (
        <div
          key={i}
          className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border bg-card"
        >
          <GripVertical className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          <div className="flex-1">
            <p className="text-card-title text-foreground">{block.label}</p>
            <p className="text-[11px] text-muted-foreground">{block.type}</p>
          </div>
          <button
            onClick={() => removeBlock(i)}
            className="p-1 text-muted-foreground hover:text-energy-red transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      {/* Add block menu */}
      <div className="grid grid-cols-2 gap-1.5">
        {blockTypes.map(({ type, label, description }) => (
          <button
            key={type}
            onClick={() => addBlock(type, label)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-left hover:border-energy-blue/40 hover:bg-energy-blue/5 transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-energy-blue shrink-0" />
            <div>
              <p className="text-small font-medium text-foreground">{label}</p>
              <p className="text-[11px] text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
