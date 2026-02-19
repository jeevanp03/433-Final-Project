import { describe, it, expect, beforeEach } from "vitest";
import { useChatStore } from "@/stores/useChatStore";

// ---------------------------------------------------------------------------
// parseSSE utility (extracted for testing since it's not exported)
// ---------------------------------------------------------------------------
function parseSSE(raw: string): { type: string; data: string } | null {
  const lines = raw.split("\n");
  let type = "token";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event: ")) type = line.slice(7).trim();
    else if (line.startsWith("data: ")) data = line.slice(6);
  }
  if (!data) return null;
  return { type, data };
}

describe("SSE parseSSE", () => {
  it("parses a token event", () => {
    const result = parseSSE("data: Hello");
    expect(result).toEqual({ type: "token", data: "Hello" });
  });

  it("parses an event with explicit type", () => {
    const result = parseSSE("event: tool_call\ndata: {\"name\":\"get_forecast\"}");
    expect(result).toEqual({ type: "tool_call", data: '{"name":"get_forecast"}' });
  });

  it("returns null when no data line present", () => {
    expect(parseSSE("event: token")).toBeNull();
  });

  it("handles done event", () => {
    const result = parseSSE("event: done\ndata: {}");
    expect(result).toEqual({ type: "done", data: "{}" });
  });

  it("parses tool_result event", () => {
    const result = parseSSE('event: tool_result\ndata: {"name":"get_status","result":{"current_kw":1.5}}');
    expect(result?.type).toBe("tool_result");
    const parsed = JSON.parse(result!.data);
    expect(parsed.name).toBe("get_status");
  });
});

// ---------------------------------------------------------------------------
// SSE stream simulation (integration-style test)
// ---------------------------------------------------------------------------
describe("SSE streaming integration", () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
  });

  it("simulates a streaming conversation via store", () => {
    const store = useChatStore.getState();

    // User sends message
    store.addMessage({ role: "user", content: "Why is my forecast high?" });
    expect(useChatStore.getState().messages).toHaveLength(1);

    // Streaming starts
    store.setIsStreaming(true);
    expect(useChatStore.getState().isStreaming).toBe(true);

    // Tokens arrive
    store.appendStreamChunk("Your forecast is high because ");
    store.appendStreamChunk("of elevated temperatures ");
    store.appendStreamChunk("and historical patterns.");
    expect(useChatStore.getState().streamingContent).toBe(
      "Your forecast is high because of elevated temperatures and historical patterns.",
    );

    // Stream finishes
    store.finaliseStream();
    expect(useChatStore.getState().messages).toHaveLength(2);
    expect(useChatStore.getState().messages[1].role).toBe("assistant");
    expect(useChatStore.getState().messages[1].content).toContain("elevated temperatures");
    expect(useChatStore.getState().isStreaming).toBe(false);
    expect(useChatStore.getState().streamingContent).toBe("");
  });

  it("handles error during streaming", () => {
    const store = useChatStore.getState();

    store.setIsStreaming(true);
    store.appendStreamChunk("partial response");

    // Error occurs
    store.setError("Chat request failed: 500");
    store.setIsStreaming(false);

    expect(useChatStore.getState().error).toBe("Chat request failed: 500");
    expect(useChatStore.getState().isStreaming).toBe(false);
  });

  it("adds fallback message on error", () => {
    const store = useChatStore.getState();

    store.addMessage({ role: "user", content: "test" });
    store.setError("timeout");
    store.addMessage({
      role: "assistant",
      content: "Sorry, I couldn't process your request. Please try again.",
    });

    const msgs = useChatStore.getState().messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[1].content).toContain("Sorry");
  });
});

// ---------------------------------------------------------------------------
// Tool call building from SSE events
// ---------------------------------------------------------------------------
describe("Tool call lifecycle", () => {
  it("builds tool call from SSE events", () => {
    // Simulate what useChatStream does with tool_call + tool_result events
    const pendingToolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      status: "loading" | "done" | "error";
      result?: unknown;
      error?: string;
    }> = [];

    // tool_call event arrives
    const tcEvent = parseSSE('event: tool_call\ndata: {"id":"tc-1","name":"get_forecast","args":{"horizon":24}}');
    expect(tcEvent).not.toBeNull();
    const tc = JSON.parse(tcEvent!.data);
    pendingToolCalls.push({
      id: tc.id ?? crypto.randomUUID(),
      name: tc.name ?? "unknown",
      args: tc.args ?? {},
      status: "loading",
    });

    expect(pendingToolCalls).toHaveLength(1);
    expect(pendingToolCalls[0].status).toBe("loading");
    expect(pendingToolCalls[0].name).toBe("get_forecast");

    // tool_result event arrives
    const trEvent = parseSSE('event: tool_result\ndata: {"id":"tc-1","name":"get_forecast","result":{"peak":4.2}}');
    const tr = JSON.parse(trEvent!.data);
    const matchingTc = pendingToolCalls.find((t) => t.name === tr.name || t.id === tr.id);
    if (matchingTc) {
      matchingTc.status = tr.error ? "error" : "done";
      matchingTc.result = tr.result;
    }

    expect(pendingToolCalls[0].status).toBe("done");
    expect((pendingToolCalls[0].result as Record<string, unknown>).peak).toBe(4.2);
  });

  it("handles tool call error", () => {
    const pendingToolCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
      status: "loading" | "done" | "error";
      result?: unknown;
      error?: string;
    }> = [];

    const tcEvent = parseSSE('event: tool_call\ndata: {"id":"tc-2","name":"get_status","args":{}}');
    const tc = JSON.parse(tcEvent!.data);
    pendingToolCalls.push({ id: tc.id, name: tc.name, args: tc.args, status: "loading" });

    const trEvent = parseSSE('event: tool_result\ndata: {"id":"tc-2","name":"get_status","error":"Server unavailable"}');
    const tr = JSON.parse(trEvent!.data);
    const matchingTc = pendingToolCalls.find((t) => t.id === tr.id);
    if (matchingTc) {
      matchingTc.status = tr.error ? "error" : "done";
      matchingTc.error = tr.error;
    }

    expect(pendingToolCalls[0].status).toBe("error");
    expect(pendingToolCalls[0].error).toBe("Server unavailable");
  });
});

// ---------------------------------------------------------------------------
// Graceful degradation (Ollama offline)
// ---------------------------------------------------------------------------
describe("Graceful degradation", () => {
  beforeEach(() => useChatStore.setState(useChatStore.getInitialState()));

  it("chat store handles error state without crashing", () => {
    const store = useChatStore.getState();
    store.setError("Ollama is not running");
    expect(useChatStore.getState().error).toBe("Ollama is not running");
    expect(useChatStore.getState().isStreaming).toBe(false);

    // Drawer can still open/close
    store.setDrawerOpen(true);
    expect(useChatStore.getState().drawerOpen).toBe(true);

    // Messages can still be added (for pre-canned responses)
    store.addMessage({
      role: "assistant",
      content: "Chat is unavailable. The LLM server is not running.",
    });
    expect(useChatStore.getState().messages).toHaveLength(1);
  });

  it("clearMessages resets error state for retry", () => {
    const store = useChatStore.getState();
    store.setError("Connection refused");
    store.addMessage({ role: "assistant", content: "Error occurred" });
    store.clearMessages();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().error).toBeNull();
  });
});
