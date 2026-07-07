"""
WebSocket connection manager singleton.
"""
from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Manages active WebSocket connections and broadcasts messages to all
    connected clients.
    """

    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(
            "WebSocket connected. Total connections: %d",
            len(self.active_connections),
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Remove a WebSocket from the active list."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(
            "WebSocket disconnected. Remaining connections: %d",
            len(self.active_connections),
        )

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """
        Send a JSON message to all active connections.
        Dead connections are removed silently.
        """
        if not self.active_connections:
            return

        payload = json.dumps(message, default=str)
        dead: List[WebSocket] = []

        for connection in self.active_connections:
            try:
                await connection.send_text(payload)
            except Exception as exc:
                logger.warning("Failed to send to WebSocket: %s", exc)
                dead.append(connection)

        for ws in dead:
            self.disconnect(ws)

    async def send_personal(
        self,
        message: Dict[str, Any],
        websocket: WebSocket,
    ) -> None:
        """Send a JSON message to a specific WebSocket."""
        try:
            payload = json.dumps(message, default=str)
            await websocket.send_text(payload)
        except Exception as exc:
            logger.warning("Failed to send personal message: %s", exc)
            self.disconnect(websocket)

    @property
    def connection_count(self) -> int:
        """Return number of active connections."""
        return len(self.active_connections)


# ---------------------------------------------------------------------------
# Module-level singleton — import this everywhere
# ---------------------------------------------------------------------------
manager = ConnectionManager()
