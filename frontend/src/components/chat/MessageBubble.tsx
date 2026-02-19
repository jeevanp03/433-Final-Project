import Markdown from "react-markdown";
import { User, Bot } from "lucide-react";
import type { ChatMessage } from "@/stores/useChatStore";
import ToolCallCard from "./ToolCallCard";

interface MessageBubbleProps {
  message: ChatMessage;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser
            ? "bg-energy-teal/15 text-energy-teal"
            : "bg-energy-blue/15 text-energy-blue"
        }`}
      >
        {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
      </div>

      {/* Content */}
      <div
        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-energy-teal text-white rounded-tr-sm"
            : "bg-card border border-border text-card-foreground rounded-tl-sm"
        }`}
      >
        {/* Tool calls (assistant only) */}
        {message.toolCalls?.map((tc) => (
          <ToolCallCard key={tc.id} toolCall={tc} />
        ))}

        {/* Message content */}
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>h1]:text-base [&>h2]:text-sm [&>h3]:text-sm [&>code]:text-xs [&>code]:bg-muted [&>code]:px-1 [&>code]:rounded [&>pre]:text-xs [&>pre]:bg-muted [&>pre]:rounded-md [&>pre]:p-2">
            <Markdown>{message.content}</Markdown>
          </div>
        )}

        {/* Timestamp */}
        <p
          className={`text-[10px] mt-1 ${
            isUser ? "text-white/60" : "text-muted-foreground"
          }`}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  );
}
