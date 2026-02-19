"""
FastAPI entry point for the Energy IDSS backend server.

Run:
    cd backend && uvicorn server.main:app --reload --port 8000
"""

from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.routers import chat, forecast, recommend, simulate, upload

app = FastAPI(
    title="Energy IDSS API",
    version="2.0.0",
    description="Household energy forecasting, optimisation, and analytics API",
)

# CORS — allow the Vite dev server + configurable origins
_default_origins = "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173"
_cors_origins = os.environ.get("CORS_ORIGINS", _default_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(forecast.router, prefix="/api")
app.include_router(recommend.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(upload.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
