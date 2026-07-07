"""
Agentic AI Financial Risk & Liquidity Balancing Oracle — FastAPI Application.

Startup sequence:
  1. Initialise DB tables
  2. Create default admin user if none exists
  3. Start TreasuryAgent background scheduler

Shutdown sequence:
  1. Stop TreasuryAgent scheduler
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from core.config import settings
from db.database import check_db_connected, init_db
from routers.auth import ensure_default_users_exist
from routers import auth, audit, decision, risk, treasury
from services.ws_manager import manager as ws_manager

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rate limiter
# ---------------------------------------------------------------------------
limiter = Limiter(key_func=get_remote_address)

# ---------------------------------------------------------------------------
# Application lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Handle startup and shutdown events."""
    # ---- Startup ----------------------------------------------------------
    logger.info("=== Banking Oracle API starting up ===")

    # 1. Initialise database
    try:
        init_db()
        logger.info("Database initialised.")
    except Exception as exc:
        logger.error("Database initialisation failed: %s", exc)

    # 2. Ensure default users and metrics exist
    try:
        from db.database import SessionLocal
        db = SessionLocal()
        try:
            ensure_default_users_exist(db)
            from routers.treasury import ensure_initial_metric_exists
            ensure_initial_metric_exists(db)
        finally:
            db.close()
    except Exception as exc:
        logger.error("Admin seed / metric seed failed: %s", exc)

    # 3. Start autonomous agent
    try:
        from ai.agent import treasury_agent
        await treasury_agent.start()
        logger.info("TreasuryAgent scheduler started.")
    except Exception as exc:
        logger.error("TreasuryAgent start failed: %s", exc)

    yield  # Application runs here

    # ---- Shutdown ---------------------------------------------------------
    logger.info("=== Banking Oracle API shutting down ===")
    try:
        from ai.agent import treasury_agent
        await treasury_agent.stop()
        logger.info("TreasuryAgent stopped.")
    except Exception as exc:
        logger.error("TreasuryAgent stop error: %s", exc)


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Agentic AI Financial Risk & Liquidity Balancing Oracle",
    description=(
        "Production-grade AI system combining Bayesian Networks, "
        "Monte Carlo simulation, and blockchain oracles for real-time "
        "treasury risk management and autonomous liquidity protection."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# Rate limiter integration
# ---------------------------------------------------------------------------
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---------------------------------------------------------------------------
# CORS Middleware
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(auth.router)
app.include_router(treasury.router)
app.include_router(risk.router)
app.include_router(decision.router)
app.include_router(audit.router)

# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health", tags=["System"], summary="Health check")
async def health_check() -> dict:
    """
    Return service health status including DB and blockchain connectivity.
    """
    db_ok = check_db_connected()

    from services.web3_service import web3_service
    bc_ok = web3_service.is_connected

    from ai.agent import treasury_agent

    return {
        "status": "healthy" if db_ok else "degraded",
        "version": "1.0.0",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "db_connected": db_ok,
        "blockchain_connected": bc_ok,
        "agent_running": treasury_agent.is_running,
        "circuit_breaker_open": treasury_agent.circuit_breaker_open,
        "ws_connections": ws_manager.connection_count,
    }


# ---------------------------------------------------------------------------
# WebSocket live feed
# ---------------------------------------------------------------------------
@app.websocket("/ws/live")
async def websocket_live(
    websocket: WebSocket,
    token: str = Query(default=""),
) -> None:
    """
    Live WebSocket feed for real-time treasury risk updates.

    Authentication: Pass JWT token as ``?token=<jwt>`` query parameter.
    """
    # Authenticate via query token
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        from core.security import verify_token
        from jose import JWTError
        payload = verify_token(token)
        username = payload.get("sub")
        if not username:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except Exception:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Accept and register connection
    await ws_manager.connect(websocket)
    logger.info("WebSocket connected: user=%s", username)

    # Send welcome message
    await ws_manager.send_personal(
        {
            "type": "connected",
            "message": f"Welcome {username}! Live risk feed active.",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        websocket,
    )

    try:
        while True:
            # Keep connection alive by reading (ping/pong)
            data = await websocket.receive_text()
            # Echo back any ping messages
            if data.strip().lower() == "ping":
                await ws_manager.send_personal(
                    {"type": "pong", "timestamp": datetime.now(timezone.utc).isoformat()},
                    websocket,
                )
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
        logger.info("WebSocket disconnected: user=%s", username)
    except Exception as exc:
        logger.error("WebSocket error for user %s: %s", username, exc)
        ws_manager.disconnect(websocket)


# ---------------------------------------------------------------------------
# Static files (optional — mount if frontend build exists)
# ---------------------------------------------------------------------------
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="static")
    logger.info("Static files mounted from: %s", _STATIC_DIR)
