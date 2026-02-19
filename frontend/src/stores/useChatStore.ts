import { create } from "zustand";

export type MessageRole = "user" | "assistant" | "system";
export type ToolCallStatus = "loading" | "done" | "error";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  timestamp: string;
}

export type Persona = "analyst" | "advisor" | "concise";

interface ChatState {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingContent: string;
  drawerOpen: boolean;
  persona: Persona;
  error: string | null;

  addMessage: (message: Omit<ChatMessage, "id" | "timestamp">) => void;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  appendStreamChunk: (chunk: string) => void;
  finaliseStream: () => void;
  setIsStreaming: (streaming: boolean) => void;
  setDrawerOpen: (open: boolean) => void;
  toggleDrawer: () => void;
  setPersona: (persona: Persona) => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  streamingContent: "",
  drawerOpen: false,
  persona: "analyst",
  error: null,

  addMessage: (message) =>
    set((s) => ({
      messages: [
        ...s.messages,
        {
          ...message,
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
        },
      ],
    })),
  updateMessage: (id, updates) =>
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m,
      ),
    })),
  appendStreamChunk: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),
  finaliseStream: () => {
    const { streamingContent } = get();
    if (streamingContent) {
      get().addMessage({ role: "assistant", content: streamingContent });
      set({ streamingContent: "", isStreaming: false });
    }
  },
  setIsStreaming: (isStreaming) =>
    set({ isStreaming, streamingContent: isStreaming ? "" : "" }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  toggleDrawer: () => set((s) => ({ drawerOpen: !s.drawerOpen })),
  setPersona: (persona) => set({ persona }),
  setError: (error) => set({ error }),
  clearMessages: () => set({ messages: [], error: null }),
}));
