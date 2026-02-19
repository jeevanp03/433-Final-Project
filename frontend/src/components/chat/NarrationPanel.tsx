import { useEffect } from "react";
import { Sparkles, RefreshCw, AlertCircle } from "lucide-react";
import { useNarration } from "@/api/hooks";

interface NarrationPanelProps {
  page: string;
  filters?: Record<string, unknown>;
  autoLoad?: boolean;
}

export default function NarrationPanel({ page, filters, autoLoad = true }: NarrationPanelProps) {
  const { data, isLoading, isError, refetch, isFetched } = useNarration({ page, filters });

  useEffect(() => {
    if (autoLoad && !isFetched) {
      refetch();
    }
  }, [autoLoad, isFetched, refetch]);

  // Shimmer loading skeleton
  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-energy-orange" />
          <span className="text-xs font-medium text-muted-foreground">AI Insight</span>
        </div>
        <div className="space-y-2 animate-pulse">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-5/6" />
          <div className="h-3 bg-muted rounded w-4/6" />
        </div>
      </div>
    );
  }

  // Error / Ollama not available — show fallback text
  if (isError || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">AI Insight</span>
        </div>
        <p className="text-sm text-muted-foreground">
          Could not reach Ollama. Make sure <code className="text-xs bg-muted px-1 py-0.5 rounded">ollama serve</code> is running, then click Retry.
        </p>
        <button
          onClick={() => refetch()}
          className="mt-2 inline-flex items-center gap-1 text-xs text-energy-blue hover:underline cursor-pointer"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  const narrative = data?.narrative ?? String(data);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-energy-orange" />
          <span className="text-xs font-medium text-muted-foreground">AI Insight</span>
        </div>
        <button
          onClick={() => refetch()}
          className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors cursor-pointer"
          title="Refresh narration"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{narrative}</p>
    </div>
  );
}
