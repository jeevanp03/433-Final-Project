import { useForecastStore, type ModelId } from "@/stores/useForecastStore";

const models: { id: ModelId; label: string; description: string }[] = [
  { id: "naive", label: "Seasonal Naive", description: "Same hour, 1 week ago" },
  { id: "ridge", label: "Ridge", description: "Regularized linear" },
  { id: "xgboost", label: "XGBoost", description: "Gradient boosting" },
];

interface ModelSelectorProps {
  multi?: boolean;
}

export default function ModelSelector({ multi = false }: ModelSelectorProps) {
  const { selectedModels, toggleModel, setSelectedModels } = useForecastStore();

  function handleClick(id: ModelId) {
    if (multi) {
      toggleModel(id);
    } else {
      setSelectedModels([id]);
    }
  }

  return (
    <div className="space-y-1.5" role={multi ? "group" : "radiogroup"} aria-label="Model selection">
      {models.map(({ id, label, description }) => {
        const active = selectedModels.includes(id);
        return (
          <button
            key={id}
            role={multi ? "checkbox" : "radio"}
            aria-checked={active}
            onClick={() => handleClick(id)}
            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
              active
                ? "border-energy-blue bg-energy-blue/5 text-foreground"
                : "border-border text-muted-foreground hover:border-energy-blue/40"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                active ? "border-energy-blue" : "border-muted-foreground/40"
              }`}
            >
              {active && <div className="w-2 h-2 rounded-full bg-energy-blue" />}
            </div>
            <div>
              <p className="text-card-title">{label}</p>
              <p className="text-small text-muted-foreground">{description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
