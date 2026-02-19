import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useChatStore } from "@/stores/useChatStore";
import { useChatStream } from "@/hooks/useChatStream";
import ChatHeader from "./ChatHeader";
import ChatInput from "./ChatInput";
import MessageBubble from "./MessageBubble";
import StreamingIndicator from "./StreamingIndicator";
import SuggestionChips from "./SuggestionChips";
import Markdown from "react-markdown";
import { Bot } from "lucide-react";

const DEFAULT_SUGGESTIONS = [
  "Why is my forecast high today?",
  "Show cost breakdown",
  "Any load-shift recommendations?",
  "Compare this week to last",
];

export default function ChatDrawer() {
  const { messages, drawerOpen, isStreaming, streamingContent, error } = useChatStore();
  const { sendMessage } = useChatStream();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or streaming
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && drawerOpen) {
        useChatStore.getState().setDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  return (
    <AnimatePresence>
      {drawerOpen && (
        <>
          {/* Backdrop (mobile only) */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 z-40 md:hidden"
            onClick={() => useChatStore.getState().setDrawerOpen(false)}
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full md:w-[400px] bg-background border-l border-border z-50 flex flex-col shadow-2xl"
          >
            <ChatHeader />

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
              {messages.length === 0 && !isStreaming && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div className="w-12 h-12 rounded-full bg-energy-blue/10 flex items-center justify-center mb-3">
                    <Bot className="w-6 h-6 text-energy-blue" />
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Energy Assistant
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed max-w-[280px]">
                    Ask me about your energy usage, forecasts, cost breakdowns, or
                    load-shifting recommendations.
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}

              {/* Streaming in-progress */}
              {isStreaming && streamingContent && (
                <div className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 bg-energy-blue/15 text-energy-blue">
                    <Bot className="w-3.5 h-3.5" />
                  </div>
                  <div className="max-w-[85%] rounded-xl rounded-tl-sm px-3.5 py-2.5 bg-card border border-border text-sm leading-relaxed">
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1">
                      <Markdown>{streamingContent}</Markdown>
                    </div>
                  </div>
                </div>
              )}

              {isStreaming && !streamingContent && <StreamingIndicator />}

              {error && (
                <div className="px-3 py-2 rounded-md bg-energy-red/5 border border-energy-red/20 text-xs text-energy-red">
                  {error}
                </div>
              )}
            </div>

            {/* Suggestion chips */}
            <SuggestionChips
              suggestions={messages.length === 0 ? DEFAULT_SUGGESTIONS : []}
              onSelect={sendMessage}
              disabled={isStreaming}
            />

            <ChatInput onSend={sendMessage} disabled={isStreaming} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
