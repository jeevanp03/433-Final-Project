"""
Conversation memory manager — sliding window with summarisation.

Keeps the last N messages in full and summarises older messages into a
compressed context paragraph. Prevents prompt size from exceeding the
model's context window.
"""

from __future__ import annotations

from typing import Any


def format_memory_block(
    messages: list[dict[str, Any]],
    window_size: int = 20,
) -> str:
    """Format conversation history for the system prompt.

    If messages exceed window_size, older messages are summarised
    into a compact paragraph. Recent messages are kept verbatim.

    Parameters
    ----------
    messages : list of dict
        Chat messages with 'role' and 'content' keys.
    window_size : int
        Number of recent messages to keep in full (20 for Llama, 10 for DeepSeek).

    Returns
    -------
    str
        Formatted memory block, or empty string if no history.
    """
    if not messages:
        return ""

    if len(messages) <= window_size:
        return ""  # No summary needed; messages are passed directly to Ollama

    # Split into old (to summarise) and recent (to keep)
    old_messages = messages[:-window_size]
    summary = _summarise_messages(old_messages)

    return f"CONVERSATION SUMMARY (older messages):\n{summary}"


def _summarise_messages(messages: list[dict[str, Any]]) -> str:
    """Create a compressed summary of older messages.

    Uses a simple extractive approach (no LLM call) to keep key facts.
    """
    facts: list[str] = []
    topics_seen: set[str] = set()

    for msg in messages:
        role = msg.get("role", "")
        content = msg.get("content", "")
        if not content or role == "system":
            continue

        # Extract key facts from user questions
        if role == "user":
            content_lower = content.lower()
            if "forecast" in content_lower and "forecast" not in topics_seen:
                facts.append(f"The user asked about forecasts.")
                topics_seen.add("forecast")
            elif "cost" in content_lower and "cost" not in topics_seen:
                facts.append(f"The user asked about costs.")
                topics_seen.add("cost")
            elif "recommend" in content_lower and "recommend" not in topics_seen:
                facts.append(f"The user asked about recommendations.")
                topics_seen.add("recommend")
            elif "simulat" in content_lower and "simulation" not in topics_seen:
                facts.append(f"The user explored a simulation scenario.")
                topics_seen.add("simulation")
            elif "history" in content_lower or "usage" in content_lower:
                if "history" not in topics_seen:
                    facts.append(f"The user asked about historical usage.")
                    topics_seen.add("history")
            elif "peak" in content_lower and "peak" not in topics_seen:
                facts.append(f"The user asked about peak demand.")
                topics_seen.add("peak")
            elif "accept" in content_lower and "action" not in topics_seen:
                facts.append(f"The user accepted a recommendation.")
                topics_seen.add("action")
            elif "shift" in content_lower and "shift" not in topics_seen:
                facts.append(f"The user discussed load shifting.")
                topics_seen.add("shift")

        # Extract key numbers from assistant responses
        elif role == "assistant":
            # Look for mentioned EUR amounts
            if "EUR" in content or "\u20ac" in content:
                # Extract first cost mention
                for word in content.split():
                    if word.replace(".", "").replace(",", "").isdigit():
                        break

    if not facts:
        return "The user had a brief conversation about energy usage."

    return " ".join(facts[:8])  # Cap at 8 facts to stay within budget


def trim_messages_for_context(
    messages: list[dict[str, Any]],
    window_size: int = 20,
) -> list[dict[str, Any]]:
    """Return only the most recent messages that fit in the context window.

    Tool result messages are truncated to 500 chars if they're too long.
    """
    recent = messages[-window_size:]
    trimmed = []
    for msg in recent:
        m = dict(msg)
        # Truncate long tool results
        if m.get("role") == "tool" and len(m.get("content", "")) > 500:
            m["content"] = m["content"][:500] + "... (truncated)"
        trimmed.append(m)
    return trimmed
