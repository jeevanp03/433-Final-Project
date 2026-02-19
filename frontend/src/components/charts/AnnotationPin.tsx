import { useState } from "react";
import { MessageSquarePlus, X } from "lucide-react";

export interface Annotation {
  id: string;
  timestamp: string;
  note: string;
  createdAt: string;
}

interface AnnotationPinProps {
  annotations: Annotation[];
  onAdd?: (timestamp: string, note: string) => void;
  onRemove?: (id: string) => void;
  selectedTimestamp?: string;
}

export default function AnnotationPin({ annotations, onAdd, onRemove, selectedTimestamp }: AnnotationPinProps) {
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);

  function handleSubmit() {
    if (note.trim() && selectedTimestamp && onAdd) {
      onAdd(selectedTimestamp, note.trim());
      setNote("");
      setAdding(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Existing annotations */}
      {annotations.map((a) => (
        <div key={a.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/50 text-small">
          <div className="w-1.5 h-1.5 rounded-full bg-energy-orange mt-1.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-muted-foreground text-[11px]">{a.timestamp}</p>
            <p className="text-foreground">{a.note}</p>
          </div>
          {onRemove && (
            <button onClick={() => onRemove(a.id)} className="p-0.5 text-muted-foreground hover:text-energy-red cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* Add annotation */}
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            placeholder="Add a note..."
            className="flex-1 px-2.5 py-1.5 text-small bg-card border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-energy-blue"
          />
          <button onClick={handleSubmit} className="px-3 py-1.5 text-small font-medium bg-energy-blue text-white rounded-lg cursor-pointer">
            Add
          </button>
          <button onClick={() => setAdding(false)} className="px-2 py-1.5 text-small text-muted-foreground cursor-pointer">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={!selectedTimestamp}
          className="flex items-center gap-1.5 text-small text-energy-blue hover:text-energy-blue/80 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <MessageSquarePlus className="w-3.5 h-3.5" />
          Add annotation
        </button>
      )}
    </div>
  );
}
