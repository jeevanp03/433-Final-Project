import { X, Trash2, Bot } from "lucide-react";
import { useChatStore } from "@/stores/useChatStore";
import { useSettingsStore } from "@/stores/useSettingsStore";

export default function ChatHeader() {
  const { setDrawerOpen, clearMessages } = useChatStore();
  const llmModel = useSettingsStore((s) => s.llmModel);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <Bot className="w-5 h-5 text-energy-teal" />
        <span className="font-semibold text-sm text-foreground">Energy Assistant</span>
        <span className="text-[10px] font-mono bg-energy-teal/10 text-energy-teal px-1.5 py-0.5 rounded">
          {llmModel}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={clearMessages}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors cursor-pointer"
          title="Clear conversation"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDrawerOpen(false)}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors cursor-pointer"
          title="Close chat"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
