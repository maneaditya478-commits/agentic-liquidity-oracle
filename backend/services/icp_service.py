"""
ICP / Motoko canister integration service.

When ICP_STUB_MODE=True  → stores records in an in-memory list (dev/test).
When ICP_STUB_MODE=False → makes HTTP calls to the ICP HTTP gateway.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List

import httpx

from core.config import settings

logger = logging.getLogger(__name__)


class ICPService:
    """
    Interface to the Motoko audit-log canister on the Internet Computer.

    In stub mode all records are held in memory and logged; no network
    traffic is generated.  In live mode, records are sent via the ICP
    HTTP gateway using the Candid-over-HTTP interface.
    """

    def __init__(self) -> None:
        self._stub_mode: bool = settings.ICP_STUB_MODE
        self._stub_records: List[Dict[str, Any]] = []
        self._stub_counter: int = 0

        if self._stub_mode:
            logger.info("ICPService running in STUB mode — no canister calls will be made.")
        else:
            logger.info(
                "ICPService targeting canister %s at %s",
                settings.ICP_CANISTER_ID,
                settings.ICP_HOST,
            )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def add_record(self, record: Dict[str, Any]) -> int:
        """
        Persist an audit record on the ICP canister.

        Parameters
        ----------
        record : Arbitrary JSON-serialisable dict.

        Returns
        -------
        int: Canister-assigned record ID.
        """
        if self._stub_mode:
            return await self._stub_add_record(record)
        return await self._live_add_record(record)

    async def get_records(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Retrieve recent audit records from the canister.

        Parameters
        ----------
        limit : Maximum number of records to return.

        Returns
        -------
        List of record dicts.
        """
        if self._stub_mode:
            return self._stub_records[-limit:][::-1]
        return await self._live_get_records(limit)

    async def get_record_count(self) -> int:
        """Return the total number of records stored on the canister."""
        if self._stub_mode:
            return self._stub_counter
        return await self._live_get_record_count()

    # ------------------------------------------------------------------
    # Stub implementation
    # ------------------------------------------------------------------
    async def _stub_add_record(self, record: Dict[str, Any]) -> int:
        self._stub_counter += 1
        record_id = self._stub_counter
        entry = {
            "id": record_id,
            "timestamp": time.time(),
            "data": record,
        }
        self._stub_records.append(entry)
        logger.debug("[ICP-STUB] Record #%d added: %s", record_id, json.dumps(record, default=str))
        return record_id

    # ------------------------------------------------------------------
    # Live implementation (HTTP gateway)
    # ------------------------------------------------------------------
    async def _live_add_record(self, record: Dict[str, Any]) -> int:
        """
        POST record to ICP HTTP gateway using the update call endpoint.

        The canister is assumed to expose:
            POST /canister/{canister_id}/call
        with a JSON body containing the Candid-encoded method and args.

        Falls back gracefully to stub counter on error.
        """
        url = (
            f"{settings.ICP_HOST}/api/v2/canister/"
            f"{settings.ICP_CANISTER_ID}/call"
        )
        body = {
            "method_name": "addRecord",
            "arg": record,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                data = resp.json()
                record_id = int(data.get("record_id", time.time()))
                logger.info("[ICP] Record stored — id=%d", record_id)
                return record_id
        except Exception as exc:
            logger.error("[ICP] add_record HTTP call failed: %s", exc)
            # Increment internal counter as a graceful fallback
            self._stub_counter += 1
            return self._stub_counter

    async def _live_get_records(self, limit: int) -> List[Dict[str, Any]]:
        url = (
            f"{settings.ICP_HOST}/api/v2/canister/"
            f"{settings.ICP_CANISTER_ID}/query"
        )
        body = {"method_name": "getRecords", "arg": {"limit": limit}}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                data = resp.json()
                return data.get("records", [])
        except Exception as exc:
            logger.error("[ICP] get_records HTTP call failed: %s", exc)
            return []

    async def _live_get_record_count(self) -> int:
        url = (
            f"{settings.ICP_HOST}/api/v2/canister/"
            f"{settings.ICP_CANISTER_ID}/query"
        )
        body = {"method_name": "getRecordCount", "arg": {}}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(url, json=body)
                resp.raise_for_status()
                data = resp.json()
                return int(data.get("count", 0))
        except Exception as exc:
            logger.error("[ICP] get_record_count HTTP call failed: %s", exc)
            return self._stub_counter


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
icp_service = ICPService()
