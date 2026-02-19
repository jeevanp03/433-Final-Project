import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}

export default function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
        {icon ?? <Inbox className="w-7 h-7 text-muted-foreground" />}
      </div>
      <h3 className="text-card-title text-foreground mb-1">{title}</h3>
      {message && (
        <p className="text-small text-muted-foreground max-w-sm mb-4">{message}</p>
      )}
      {action}
    </div>
  );
}
