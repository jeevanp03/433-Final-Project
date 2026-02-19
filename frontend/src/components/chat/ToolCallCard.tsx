import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, CheckCircle, AlertCircle, Wrench } from "lucide-react";
import type { ToolCall } from "@/stores/useChatStore";

const TOOL_LABELS: Record<string, string> = {
  get_forecast: "Fetching forecast",
  get_history: "Loading history",
  get_status: "Checking status",
  get_recommendations: "Getting recommendations",
  get_explanation: "Explaining forecast",
  run_simulation: "Running simulation",
  get_metrics: "Loading metrics",
  get_decomposition: "Decomposing signal",
  get_backtest: "Running backtest",
  adjust_constraints: "Adjusting constraints",
};

interface ToolCallCardProps {
  toolCall: ToolCall;
}

export default function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolCall.name] ?? toolCall.name;

  return (
    <div className="rounded-md border border-border bg-muted/50 text-xs my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-2.5 py-1.5 text-left cursor-pointer"
      >
        {toolCall.status === "loading" && (
          <Loader2 className="w-3.5 h-3.5 text-energy-blue animate-spin shrink-0" />
        )}
        {toolCall.status === "done" && (
          <CheckCircle className="w-3.5 h-3.5 text-energy-green shrink-0" />
        )}
        {toolCall.status === "error" && (
          <AlertCircle className="w-3.5 h-3.5 text-energy-red shrink-0" />
        )}
        <Wrench className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="flex-1 truncate text-foreground">{label}</span>
        {toolCall.status !== "loading" &&
          (expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ))}
      </button>
      {expanded && toolCall.status !== "loading" && (
        <div className="px-2.5 pb-2 border-t border-border">
          {toolCall.error ? (
            <p className="text-energy-red mt-1">{toolCall.error}</p>
          ) : (
            <pre className="mt-1 text-muted-foreground overflow-x-auto max-h-32 whitespace-pre-wrap font-mono">
              {typeof toolCall.result === "string"
                ? toolCall.result
                : JSON.stringify(toolCall.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
