"""
FastAPI entry point for the Energy IDSS backend server.

Run:
    cd frontend && PYTHONPATH=../backend uvicorn server.main:app --reload --port 8000
"""

from __future__ import annotations

import sys
from pathlib import Path

# Ensure backend is importable before any router import
_backend_root = Path(__file__).resolve().parents[1].parent / "backend"
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from server.routers import forecast, recommend, simulate

app = FastAPI(
    title="Energy IDSS API",
    version="2.0.0",
    description="Household energy forecasting, optimisation, and analytics API",
)

# CORS — allow the Vite dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(forecast.router, prefix="/api")
app.include_router(recommend.router, prefix="/api")
app.include_router(simulate.router, prefix="/api")


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
