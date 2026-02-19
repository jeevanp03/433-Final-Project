"""
LLM orchestrator — main chat loop with Ollama integration.

Handles:
- Streaming chat via Ollama's Python client
- Tool call interception, execution, and re-injection
- DeepSeek-R1 XML tag parsing fallback
- Health check and automatic model selection
- Rate limiting and safety guardrails
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from collections import defaultdict
from typing import Any, AsyncGenerator

import httpx

_DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "deepseek-r1:1.5b")

from server.llm.memory import trim_messages_for_context
from server.llm.prompts import build_system_prompt
from server.llm.tools import execute_tool, get_tool_definitions

logger = logging.getLogger(__name__)

# Rate limiting: max 10 messages per minute per session
_rate_limiter: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT = 10
RATE_WINDOW = 60  # seconds


# ---------------------------------------------------------------------------
# Ollama health check & model selection
# ---------------------------------------------------------------------------

async def check_ollama_health(ollama_url: str = "http://localhost:11434") -> dict[str, Any]:
    """Check if Ollama is running and what models are available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{ollama_url}/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("models", [])
                model_list = [
                    {
                        "name": m.get("name", ""),
                        "size": m.get("size", 0),
                        "loaded": m.get("details", {}).get("family", "") != "",
                    }
                    for m in models
                ]
                return {
                    "available": True,
                    "models": model_list,
                    "model_names": [m["name"] for m in model_list],
                }
    except (httpx.ConnectError, httpx.TimeoutException):
        pass
    return {"available": False, "models": [], "model_names": []}


async def select_model(
    preferred: str = _DEFAULT_MODEL,
    ollama_url: str = "http://localhost:11434",
) -> str:
    """Auto-select the best available model."""
    health = await check_ollama_health(ollama_url)
    if not health["available"]:
        return preferred

    available = health["model_names"]
    if not available:
        return preferred

    # Prefer the user's choice if available
    if preferred in available:
        return preferred

    # Fallback priority
    preferences = [
        "deepseek-r1:1.5b", "deepseek-r1:latest",
        "llama3:8b", "llama3.1:8b", "llama3:latest",
    ]
    for model in preferences:
        if model in available:
            return model

    # Use whatever is available
    return available[0]


# ---------------------------------------------------------------------------
# DeepSeek-R1 XML tag parsing
# ---------------------------------------------------------------------------

_TOOL_CALL_RE = re.compile(r"<tool_call>(.*?)</tool_call>", re.DOTALL)


def parse_deepseek_tool_call(text: str) -> tuple[str | None, dict[str, Any] | None]:
    """Parse a DeepSeek-R1 XML-style tool call from text.

    Expected format: <tool_call>tool_name(arg1='val1', arg2='val2')</tool_call>

    Returns (tool_name, args_dict) or (None, None) if no match.
    """
    match = _TOOL_CALL_RE.search(text)
    if not match:
        return None, None

    call_str = match.group(1).strip()

    # Parse function-call style: tool_name(arg1='val1', arg2='val2')
    paren_idx = call_str.find("(")
    if paren_idx == -1:
        return call_str, {}

    tool_name = call_str[:paren_idx].strip()
    args_str = call_str[paren_idx + 1:].rstrip(")")

    # Parse args
    args: dict[str, Any] = {}
    if args_str.strip():
        # Try JSON first
        try:
            args = json.loads("{" + args_str + "}")
        except json.JSONDecodeError:
            # Parse key=value pairs
            for part in _split_args(args_str):
                if "=" in part:
                    key, _, val = part.partition("=")
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    # Try to parse as number
                    try:
                        val = int(val)
                    except ValueError:
                        try:
                            val = float(val)
                        except ValueError:
                            pass
                    args[key] = val

    return tool_name, args


def _split_args(s: str) -> list[str]:
    """Split comma-separated args, respecting quotes and brackets."""
    parts: list[str] = []
    current = ""
    depth = 0
    in_quote = False
    quote_char = ""
    for ch in s:
        if ch in ("'", '"') and not in_quote:
            in_quote = True
            quote_char = ch
            current += ch
        elif ch == quote_char and in_quote:
            in_quote = False
            current += ch
        elif ch in ("[", "{", "(") and not in_quote:
            depth += 1
            current += ch
        elif ch in ("]", "}", ")") and not in_quote:
            depth -= 1
            current += ch
        elif ch == "," and depth == 0 and not in_quote:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())
    return parts


# ---------------------------------------------------------------------------
# Output validation / safety guardrails
# ---------------------------------------------------------------------------

def validate_output(text: str) -> tuple[str, bool]:
    """Validate LLM output for common failure patterns.

    Returns (text, is_flagged). If flagged, a [confidence: low] tag is prepended.
    """
    flagged = False

    # Check for "as an AI" type responses
    ai_patterns = ["as an ai", "as a language model", "i'm an ai", "i am an ai"]
    if any(p in text.lower() for p in ai_patterns):
        flagged = True

    # Check for excessively long output
    if len(text) > 8000:
        text = text[:8000] + "\n\n(Response truncated for brevity.)"
        flagged = True

    if flagged:
        text = "[confidence: low]\n" + text

    return text, flagged


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def check_rate_limit(session_id: str = "default") -> bool:
    """Return True if within rate limit, False if exceeded."""
    now = time.time()
    # Clean old entries
    _rate_limiter[session_id] = [
        t for t in _rate_limiter[session_id] if now - t < RATE_WINDOW
    ]
    if len(_rate_limiter[session_id]) >= RATE_LIMIT:
        return False
    _rate_limiter[session_id].append(now)
    return True


# ---------------------------------------------------------------------------
# Main streaming chat loop
# ---------------------------------------------------------------------------

async def stream_chat(
    messages: list[dict[str, Any]],
    context: dict[str, Any] | None = None,
    model: str = _DEFAULT_MODEL,
    max_tool_calls: int = 3,
    temperature: float = 0.3,
    ollama_url: str = "http://localhost:11434",
    session_id: str = "default",
) -> AsyncGenerator[dict[str, Any], None]:
    """Stream a chat response from Ollama with tool-use support.

    Yields SSE-compatible event dicts:
    - {"type": "token", "data": "text chunk"}
    - {"type": "tool_call", "data": {"name": ..., "args": ...}}
    - {"type": "tool_result", "data": {"name": ..., "result": ...}}
    - {"type": "error", "data": "error message"}
    - {"type": "done", "data": ""}
    """
    # Rate limit check
    if not check_rate_limit(session_id):
        yield {"type": "error", "data": "Rate limit exceeded. Please wait a moment."}
        yield {"type": "done", "data": ""}
        return

    is_deepseek = "deepseek" in model.lower()

    # Build system prompt
    system_prompt = build_system_prompt(
        context=context,
        messages=messages,
        model=model,
    )

    # Prepare messages for Ollama
    window_size = 10 if is_deepseek else 20
    trimmed = trim_messages_for_context(messages, window_size=window_size)
    full_messages = [{"role": "system", "content": system_prompt}] + trimmed

    # Tool definitions (only for Llama; DeepSeek uses text-based in prompt)
    tools = get_tool_definitions(model) if not is_deepseek else None

    tool_call_count = 0

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0)) as client:
            while tool_call_count <= max_tool_calls:
                # Build Ollama request
                payload: dict[str, Any] = {
                    "model": model,
                    "messages": full_messages,
                    "stream": True,
                    "options": {"temperature": temperature},
                }
                if tools:
                    payload["tools"] = tools

                accumulated_content = ""
                tool_call_detected = False

                async with client.stream(
                    "POST",
                    f"{ollama_url}/api/chat",
                    json=payload,
                    timeout=60.0,
                ) as response:
                    if response.status_code != 200:
                        yield {
                            "type": "error",
                            "data": f"Ollama returned status {response.status_code}",
                        }
                        yield {"type": "done", "data": ""}
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        msg = chunk.get("message", {})

                        # Check for native tool calls (Llama 3)
                        tool_calls = msg.get("tool_calls", [])
                        if tool_calls:
                            for tc in tool_calls:
                                fn = tc.get("function", {})
                                tool_name = fn.get("name", "")
                                tool_args = fn.get("arguments", {})

                                yield {
                                    "type": "tool_call",
                                    "data": {"name": tool_name, "args": tool_args},
                                }

                                # Execute tool
                                result = await execute_tool(tool_name, tool_args)

                                yield {
                                    "type": "tool_result",
                                    "data": {"name": tool_name, "result": result},
                                }

                                # Re-inject tool result into conversation
                                full_messages.append({
                                    "role": "assistant",
                                    "content": accumulated_content,
                                    "tool_calls": tool_calls,
                                })
                                full_messages.append({
                                    "role": "tool",
                                    "content": json.dumps(result, default=str)[:2000],
                                })

                                tool_call_count += 1
                                tool_call_detected = True
                                break
                            if tool_call_detected:
                                break

                        # Regular text content
                        content = msg.get("content", "")
                        if content:
                            accumulated_content += content

                            # DeepSeek XML tag check
                            if is_deepseek and "<tool_call>" in accumulated_content:
                                tool_name, tool_args = parse_deepseek_tool_call(
                                    accumulated_content
                                )
                                if tool_name:
                                    # Don't yield the XML tag as text
                                    pre_tag = accumulated_content.split("<tool_call>")[0]
                                    if pre_tag.strip():
                                        yield {"type": "token", "data": pre_tag}

                                    yield {
                                        "type": "tool_call",
                                        "data": {
                                            "name": tool_name,
                                            "args": tool_args or {},
                                        },
                                    }

                                    result = await execute_tool(
                                        tool_name, tool_args or {}
                                    )

                                    yield {
                                        "type": "tool_result",
                                        "data": {"name": tool_name, "result": result},
                                    }

                                    # Re-inject
                                    result_text = json.dumps(result, default=str)[:2000]
                                    full_messages.append({
                                        "role": "assistant",
                                        "content": accumulated_content,
                                    })
                                    full_messages.append({
                                        "role": "user",
                                        "content": f"<tool_result>{result_text}</tool_result>",
                                    })

                                    tool_call_count += 1
                                    tool_call_detected = True
                                    accumulated_content = ""
                                    break
                            else:
                                yield {"type": "token", "data": content}

                        # Check if stream is done
                        if chunk.get("done", False):
                            break

                # If no tool call was made, we're done
                if not tool_call_detected:
                    # Validate output
                    if accumulated_content:
                        validated, _ = validate_output(accumulated_content)
                        if validated != accumulated_content:
                            # Re-yield only the difference (flagging prefix)
                            diff = validated[: len(validated) - len(accumulated_content)]
                            if diff:
                                yield {"type": "token", "data": diff}
                    break

                # Reset for next iteration
                tool_call_detected = False

    except httpx.ConnectError:
        yield {
            "type": "error",
            "data": "Cannot connect to Ollama. Please ensure it is running.",
        }
    except httpx.TimeoutException:
        yield {
            "type": "error",
            "data": "The assistant took too long to respond. Please try again.",
        }
    except Exception as e:
        logger.exception("Unexpected error in stream_chat")
        yield {
            "type": "error",
            "data": "The assistant encountered an issue. Your data and dashboard are unaffected.",
        }

    yield {"type": "done", "data": ""}


# ---------------------------------------------------------------------------
# Non-streaming helpers for narration & suggestions
# ---------------------------------------------------------------------------

async def generate_narration(
    page: str,
    context: dict[str, Any],
    model: str = _DEFAULT_MODEL,
    ollama_url: str = "http://localhost:11434",
) -> dict[str, Any]:
    """Generate a page narration (non-streaming).

    Returns {"narrative": str, "highlights": list[str]}.
    Falls back to template-based text if Ollama is unavailable.
    """
    health = await check_ollama_health(ollama_url)
    if not health["available"]:
        return _fallback_narration(page, context)

    # Build a narration-specific prompt
    system = (
        "You are the Energy Assistant. Generate a brief 2-3 sentence narration "
        "summarising the user's current energy dashboard view. Be specific with "
        "numbers (use the provided context). Mention actionable insights."
    )
    context_text = f"Page: {page}\n"
    kpis = context.get("kpis", {})
    if kpis:
        context_text += f"Current draw: {kpis.get('current_kw', '?')} kW, "
        context_text += f"Today total: {kpis.get('today_kwh', '?')} kWh, "
        context_text += f"Est cost: EUR {kpis.get('est_cost', '?')}\n"

    filters = context.get("filters", {})
    if filters:
        context_text += f"Filters: {json.dumps(filters)}\n"

    data_summary = context.get("data_summary", {})
    if data_summary:
        context_text += f"Data: {json.dumps(data_summary)}\n"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Narrate this view:\n{context_text}"},
    ]

    temperature = 0.1 if "deepseek" in model.lower() else 0.1

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": temperature},
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                text = data.get("message", {}).get("content", "")
                return {"narrative": text, "highlights": []}
    except (httpx.ConnectError, httpx.TimeoutException):
        pass

    return _fallback_narration(page, context)


async def generate_suggestions(
    page: str,
    context: dict[str, Any],
    model: str = _DEFAULT_MODEL,
    ollama_url: str = "http://localhost:11434",
) -> list[dict[str, str]]:
    """Generate context-aware suggestion chips.

    Returns a list of {"text": str, "scenario_config"?: str} dicts.
    Falls back to hardcoded suggestions if Ollama is unavailable.
    """
    health = await check_ollama_health(ollama_url)
    if not health["available"]:
        return _fallback_suggestions(page)

    system = (
        "Generate 3-4 short question suggestions for a household energy dashboard user. "
        "Each should be a natural question they might ask about their energy data. "
        "Return ONLY a JSON array of strings, no other text."
    )
    user_msg = f"The user is on the {page} page."
    if context.get("filters"):
        user_msg += f" Active filters: {json.dumps(context['filters'])}"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user_msg},
                    ],
                    "stream": False,
                    "options": {"temperature": 0.3},
                },
            )
            if resp.status_code == 200:
                text = resp.json().get("message", {}).get("content", "")
                # Try to parse JSON array from response
                try:
                    suggestions = json.loads(text)
                    if isinstance(suggestions, list):
                        return [{"text": s} for s in suggestions[:4]]
                except json.JSONDecodeError:
                    pass
    except (httpx.ConnectError, httpx.TimeoutException):
        pass

    return _fallback_suggestions(page)


# ---------------------------------------------------------------------------
# Fallbacks (when Ollama is unavailable)
# ---------------------------------------------------------------------------

def _fallback_narration(page: str, context: dict[str, Any]) -> dict[str, Any]:
    """Template-based narration fallback."""
    kpis = context.get("kpis", {})
    kwh = kpis.get("today_kwh", "?")
    peak = kpis.get("current_kw", "?")
    cost = kpis.get("est_cost", "?")

    templates = {
        "Dashboard": f"Your usage today: {kwh} kWh. Peak: {peak} kW at EUR {cost} est. cost.",
        "Forecast": "Viewing the forecast. Select different models or horizons to compare.",
        "Simulate": "Build a what-if scenario to explore how changes affect your usage.",
        "Analytics": "Explore your historical usage patterns across different time periods.",
        "Actions": "Review pending recommendations to reduce your peak demand and cost.",
        "Settings": "Configure your preferences, appliances, and pricing schedule.",
    }
    return {
        "narrative": templates.get(page, f"Viewing the {page} page."),
        "highlights": [],
    }


def _fallback_suggestions(page: str) -> list[dict[str, str]]:
    """Hardcoded suggestion chips per page."""
    suggestions = {
        "Dashboard": [
            {"text": "Why is my forecast high?"},
            {"text": "How does today compare to last week?"},
            {"text": "Any recommendations?"},
        ],
        "Forecast": [
            {"text": "How accurate was this model last month?"},
            {"text": "Compare XGBoost vs Ridge"},
            {"text": "Explain the peak at 19:00"},
        ],
        "Simulate": [
            {"text": "What if I add solar panels?"},
            {"text": "Simulate a heat wave"},
            {"text": "Which scenario saves the most?"},
        ],
        "Analytics": [
            {"text": "Summarise my usage trends"},
            {"text": "When do I use the most energy?"},
            {"text": "What changed since last winter?"},
        ],
        "Actions": [
            {"text": "Why should I shift the dishwasher?"},
            {"text": "What if I reject all recommendations?"},
            {"text": "How reliable are these savings?"},
        ],
    }
    return suggestions.get(page, [{"text": "What's my current usage?"}])
