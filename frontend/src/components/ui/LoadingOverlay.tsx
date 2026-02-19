interface LoadingOverlayProps {
  message?: string;
  variant?: "spinner" | "skeleton";
  count?: number;
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-pulse">
      <div className="h-3 w-24 bg-muted rounded mb-3" />
      <div className="h-8 w-32 bg-muted rounded mb-2" />
      <div className="h-2 w-16 bg-muted rounded" />
    </div>
  );
}

export default function LoadingOverlay({ message, variant = "spinner", count = 4 }: LoadingOverlayProps) {
  if (variant === "skeleton") {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="relative w-10 h-10">
        <div className="absolute inset-0 rounded-full border-2 border-muted" />
        <div className="absolute inset-0 rounded-full border-2 border-t-energy-blue animate-spin" />
      </div>
      {message && <p className="text-small text-muted-foreground">{message}</p>}
    </div>
  );
}
