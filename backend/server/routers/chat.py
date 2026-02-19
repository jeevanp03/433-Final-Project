"""
Chat, narration, suggestions, and LLM status endpoints.

POST /api/chat       — SSE streaming chat with tool-use
POST /api/chat/narrate — Auto-generated page narration (non-streaming)
POST /api/chat/suggest — Context-aware suggestion chips
GET  /api/llm/status  — Ollama health check
GET  /api/llm/models  — List installed Ollama models
"""

from __future__ import annotations

import json
import os
from typing import Any

from fastapi import APIRouter, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = os.environ.get("OLLAMA_MODEL", "deepseek-r1:1.5b")

from server.llm.orchestrator import (
    check_ollama_health,
    generate_narration,
    generate_suggestions,
    select_model,
    stream_chat,
)

router = APIRouter(tags=["chat"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    context: dict[str, Any] | None = None
    model: str | None = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    max_tool_calls: int = Field(default=3, ge=0, le=10)


class NarrateRequest(BaseModel):
    page: str
    filters: dict[str, Any] | None = None
    data_summary: dict[str, Any] | None = None
    kpis: dict[str, Any] | None = None


class NarrateResponse(BaseModel):
    narrative: str
    highlights: list[str] = []


class SuggestRequest(BaseModel):
    page: str
    usage_patterns: dict[str, Any] | None = None


class SuggestResponse(BaseModel):
    suggestions: list[dict[str, str]]


class LlmStatusResponse(BaseModel):
    available: bool
    model: str
    ram_usage_mb: int = 0


class LlmModel(BaseModel):
    name: str
    size: int = 0
    loaded: bool = False


class LlmModelsResponse(BaseModel):
    models: list[LlmModel]


# ---------------------------------------------------------------------------
# POST /api/chat — SSE streaming
# ---------------------------------------------------------------------------

@router.post("/chat")
async def chat_stream(req: ChatRequest, request: Request):
    """Main conversational interface. Streams tokens via SSE."""
    ollama_url = OLLAMA_URL
    model = req.model or DEFAULT_MODEL

    # Auto-select if preferred model isn't available
    model = await select_model(model, ollama_url)

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    async def event_generator():
        async for event in stream_chat(
            messages=messages,
            context=req.context,
            model=model,
            max_tool_calls=req.max_tool_calls,
            temperature=req.temperature,
            ollama_url=ollama_url,
        ):
            event_type = event.get("type", "token")
            data = event.get("data", "")

            if isinstance(data, dict):
                data = json.dumps(data, default=str)
            elif not isinstance(data, str):
                data = str(data)

            yield f"event: {event_type}\ndata: {data}\n\n"

            # Check if client disconnected
            if await request.is_disconnected():
                break

        yield "event: done\ndata: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ---------------------------------------------------------------------------
# POST /api/chat/narrate — page narration (non-streaming)
# ---------------------------------------------------------------------------

@router.post("/chat/narrate", response_model=NarrateResponse)
async def narrate(req: NarrateRequest):
    """Generate auto-narration for a page. Cached 2 min on frontend."""
    context = {
        "page": req.page,
        "filters": req.filters or {},
        "kpis": req.kpis or {},
        "data_summary": req.data_summary or {},
    }
    result = await generate_narration(
        page=req.page,
        context=context,
        model=DEFAULT_MODEL,
        ollama_url=OLLAMA_URL,
    )
    return NarrateResponse(**result)


# ---------------------------------------------------------------------------
# POST /api/chat/suggest — suggestion chips
# ---------------------------------------------------------------------------

@router.post("/chat/suggest", response_model=SuggestResponse)
async def suggest(req: SuggestRequest):
    """Generate context-aware suggestion chips. Cached 5 min on frontend."""
    context = {"filters": req.usage_patterns or {}}
    suggestions = await generate_suggestions(
        page=req.page,
        context=context,
        model=DEFAULT_MODEL,
        ollama_url=OLLAMA_URL,
    )
    return SuggestResponse(suggestions=suggestions)


# ---------------------------------------------------------------------------
# GET /api/llm/status — health check
# ---------------------------------------------------------------------------

@router.get("/llm/status", response_model=LlmStatusResponse)
async def llm_status():
    """Check if Ollama is running. Frontend uses this to show/hide LLM features."""
    health = await check_ollama_health(OLLAMA_URL)
    model = "none"
    if health["available"] and health["model_names"]:
        model = await select_model(ollama_url=OLLAMA_URL)
    return LlmStatusResponse(
        available=health["available"],
        model=model,
    )


# ---------------------------------------------------------------------------
# GET /api/llm/models — list installed models
# ---------------------------------------------------------------------------

@router.get("/llm/models", response_model=LlmModelsResponse)
async def llm_models():
    """List Ollama models available for the Settings dropdown."""
    health = await check_ollama_health(OLLAMA_URL)
    models = [LlmModel(**m) for m in health.get("models", [])]
    return LlmModelsResponse(models=models)
