import { Sparkles } from "lucide-react";

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (suggestion: string) => void;
  disabled?: boolean;
}

export default function SuggestionChips({ suggestions, onSelect, disabled }: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide">
      <Sparkles className="w-3.5 h-3.5 text-energy-orange shrink-0" />
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          disabled={disabled}
          className="shrink-0 px-3 py-1 text-xs rounded-full border border-border bg-background text-foreground hover:bg-muted hover:border-energy-blue/30 transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
        >
          {s}
        </button>
      ))}
    </div>
  );
}
