import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export default function ErrorFallback({
  title = "Something went wrong",
  message = "Unable to load this content. Please try again.",
  onRetry,
}: ErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-energy-red/10 flex items-center justify-center mb-4">
        <AlertTriangle className="w-6 h-6 text-energy-red" />
      </div>
      <h3 className="text-card-title text-foreground mb-1">{title}</h3>
      <p className="text-small text-muted-foreground mb-4 max-w-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 text-small font-medium rounded-lg bg-energy-blue text-white hover:bg-energy-blue/90 transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Try again
        </button>
      )}
    </div>
  );
}
