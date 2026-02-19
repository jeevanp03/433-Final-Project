import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="fixed inset-0 z-50 m-auto p-0 bg-transparent backdrop:bg-black/50"
    >
      <div className="bg-card rounded-xl shadow-xl border border-border p-6 w-[400px] max-w-[90vw]">
        {variant === "danger" && (
          <div className="w-10 h-10 rounded-full bg-energy-red/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5 text-energy-red" />
          </div>
        )}
        <h3 className="text-section-heading text-foreground mb-2">{title}</h3>
        <p className="text-body text-muted-foreground mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-small font-medium rounded-lg border border-border text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-small font-medium rounded-lg text-white transition-colors cursor-pointer ${
              variant === "danger"
                ? "bg-energy-red hover:bg-energy-red/90"
                : "bg-energy-blue hover:bg-energy-blue/90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
