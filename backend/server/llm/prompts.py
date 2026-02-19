"""
LLM prompt system — persona, formatting rules, safety guardrails.

The system prompt is assembled dynamically from four blocks:
1. Persona block (static)
2. Context block (dynamic, injected per message)
3. Tool definitions block (static, model-dependent)
4. Conversation memory block (dynamic)
"""

from __future__ import annotations

import os

from server.llm.context import build_context_block
from server.llm.memory import format_memory_block
from server.llm.tools import get_deepseek_tool_text, get_tool_definitions

_DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "deepseek-r1:1.5b")

# ---------------------------------------------------------------------------
# 1. Persona block (~300 tokens, fixed, never trimmed)
# ---------------------------------------------------------------------------

PERSONA_LLAMA = """\
You are the Energy Assistant, an AI advisor embedded in a household energy dashboard. \
Your role is to help the user understand their electricity usage, interpret forecasts, \
evaluate scenarios, and make informed decisions about load shifting and cost reduction.

RULES:
- ALWAYS use tools to get data before making quantitative claims.
- NEVER guess, estimate, or fabricate numbers.
- If a tool fails or returns no data, say so honestly.
- Keep responses concise (2-4 sentences unless the user asks for detail).
- Use EUR for currency (French household).
- When referencing times, use 24h format (e.g., 19:00, not 7 PM).
- When suggesting actions, include [Action Button] directives.
- When referencing specific data, include [View] navigation directives."""

PERSONA_DEEPSEEK = """\
You are the Energy Assistant for a household energy dashboard. \
Help the user understand their electricity usage and costs.

RULES:
- Use tools to get data before stating numbers.
- Never fabricate numbers. Say "I don't have that data" if a tool fails.
- Keep responses short (2-3 sentences).
- Use EUR for currency. Use 24h time format."""

# ---------------------------------------------------------------------------
# Safety guardrails (appended to persona)
# ---------------------------------------------------------------------------

SAFETY_SUFFIX = """

SAFETY:
- Do not discuss topics unrelated to household energy management.
- If you cannot verify a number with a tool, do not state it.
- Never recommend actions that could be unsafe (e.g., disabling safety systems).
- If the user asks about something outside your scope, politely redirect."""


def build_system_prompt(
    context: dict | None = None,
    messages: list[dict] | None = None,
    model: str = _DEFAULT_MODEL,
) -> str:
    """Assemble the full system prompt from all blocks.

    Returns a single string under the token budget for the target model.
    """
    is_deepseek = "deepseek" in model.lower()
    max_tokens = 4096 if is_deepseek else 8192

    # 1. Persona
    persona = PERSONA_DEEPSEEK if is_deepseek else PERSONA_LLAMA
    prompt_parts = [persona + SAFETY_SUFFIX]

    # 2. Context block
    context_text = build_context_block(context or {}, compact=is_deepseek)
    if context_text:
        prompt_parts.append(context_text)

    # 3. Tool definitions (DeepSeek uses text-based, Llama uses native)
    if is_deepseek:
        prompt_parts.append(get_deepseek_tool_text())

    # 4. Memory / conversation summary
    if messages:
        window_size = 10 if is_deepseek else 20
        memory_text = format_memory_block(messages, window_size=window_size)
        if memory_text:
            prompt_parts.append(memory_text)

    full_prompt = "\n\n".join(prompt_parts)

    # Token budget check (rough: 1 token ~ 4 chars)
    estimated_tokens = len(full_prompt) // 4
    budget = max_tokens - 1000  # reserve for generation

    if estimated_tokens > budget:
        full_prompt = _truncate_prompt(full_prompt, budget)

    return full_prompt


def _truncate_prompt(prompt: str, token_budget: int) -> str:
    """Truncate prompt to fit within token budget, preserving persona."""
    char_budget = token_budget * 4
    if len(prompt) <= char_budget:
        return prompt
    # Keep the first section (persona + safety) intact, trim the rest
    sections = prompt.split("\n\n")
    result = sections[0]  # persona always kept
    for section in sections[1:]:
        if len(result) + len(section) + 2 > char_budget:
            break
        result += "\n\n" + section
    return result
