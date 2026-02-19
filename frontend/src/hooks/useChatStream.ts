import { useCallback, useRef } from "react";
import { useChatStore, type ToolCall } from "@/stores/useChatStore";
import { api } from "@/api/client";

interface StreamEvent {
  type: string;
  data: string;
}

function parseSSE(raw: string): StreamEvent | null {
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

export function useChatStream() {
  const abortRef = useRef<AbortController | null>(null);
  const {
    messages,
    addMessage,
    updateMessage,
    appendStreamChunk,
    finaliseStream,
    setIsStreaming,
    setError,
  } = useChatStore();

  const sendMessage = useCallback(
    async (userContent: string) => {
      // Add user message
      addMessage({ role: "user", content: userContent });

      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsStreaming(true);
      setError(null);

      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userContent },
      ];

      try {
        const response = await fetch(`${api.defaults.baseURL}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: allMessages }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";
        let assistantId: string | null = null;
        const pendingToolCalls: ToolCall[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";

          for (const chunk of chunks) {
            const event = parseSSE(chunk);
            if (!event) continue;

            switch (event.type) {
              case "token":
                appendStreamChunk(event.data);
                break;

              case "tool_call": {
                try {
                  const tc = JSON.parse(event.data);
                  const toolCall: ToolCall = {
                    id: tc.id ?? crypto.randomUUID(),
                    name: tc.name ?? "unknown",
                    args: tc.args ?? {},
                    status: "loading",
                  };
                  pendingToolCalls.push(toolCall);
                } catch {
                  // ignore malformed tool call events
                }
                break;
              }

              case "tool_result": {
                try {
                  const tr = JSON.parse(event.data);
                  const tc = pendingToolCalls.find((t) => t.name === tr.name || t.id === tr.id);
                  if (tc) {
                    tc.status = tr.error ? "error" : "done";
                    tc.result = tr.result;
                    tc.error = tr.error;
                  }
                } catch {
                  // ignore
                }
                break;
              }

              case "done":
                break;
            }
          }
        }

        // Finalise the streamed assistant message
        const { streamingContent } = useChatStore.getState();
        if (streamingContent || pendingToolCalls.length > 0) {
          addMessage({
            role: "assistant",
            content: streamingContent,
            toolCalls: pendingToolCalls.length > 0 ? pendingToolCalls : undefined,
          });
          useChatStore.setState({ streamingContent: "", isStreaming: false });
        } else {
          setIsStreaming(false);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setIsStreaming(false);
          return;
        }
        const msg = err instanceof Error ? err.message : "Chat request failed";
        setError(msg);
        setIsStreaming(false);
        addMessage({
          role: "assistant",
          content: "Sorry, I couldn't process your request. Please try again.",
        });
      }
    },
    [messages, addMessage, updateMessage, appendStreamChunk, finaliseStream, setIsStreaming, setError],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    finaliseStream();
  }, [finaliseStream]);

  return { sendMessage, cancel };
}
