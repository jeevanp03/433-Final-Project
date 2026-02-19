import { useEffect } from "react";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { useUIStore, type ToastMessage } from "@/stores/useUIStore";

const icons: Record<ToastMessage["type"], typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const colours: Record<ToastMessage["type"], string> = {
  success: "border-energy-green/30 bg-energy-green/5",
  error: "border-energy-red/30 bg-energy-red/5",
  warning: "border-energy-orange/30 bg-energy-orange/5",
  info: "border-energy-blue/30 bg-energy-blue/5",
};

const iconColours: Record<ToastMessage["type"], string> = {
  success: "text-energy-green",
  error: "text-energy-red",
  warning: "text-energy-orange",
  info: "text-energy-blue",
};

function ToastItem({ toast }: { toast: ToastMessage }) {
  const { dismissToast } = useUIStore();
  const Icon = icons[toast.type];

  useEffect(() => {
    const duration = toast.duration ?? 5000;
    const timer = setTimeout(() => dismissToast(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, dismissToast]);

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border shadow-lg bg-card ${colours[toast.type]} animate-in slide-in-from-top-2 fade-in duration-300`}
      role="alert"
    >
      <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColours[toast.type]}`} />
      <div className="flex-1 min-w-0">
        <p className="text-card-title text-foreground">{toast.title}</p>
        {toast.description && (
          <p className="text-small text-muted-foreground mt-0.5">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => dismissToast(toast.id)}
        className="p-0.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
