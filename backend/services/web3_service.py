"""
EVM / Web3 blockchain interaction service.

Connects to an EVM-compatible JSON-RPC endpoint, loads the TreasuryGuard
smart-contract ABI, and exposes async methods to execute oracle actions,
query contract state, and fetch recent events.

Falls back to mock data if the node is unreachable so the API remains
functional during development.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from core.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TreasuryGuard ABI (inline)
# ---------------------------------------------------------------------------
TREASURY_GUARD_ABI: List[Dict[str, Any]] = [
    # ------------------------------------------------------------------ #
    # Functions
    # ------------------------------------------------------------------ #
    {
        "name": "lockLiquidity",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "riskScore", "type": "uint256"},
            {"name": "varAmount", "type": "uint256"},
            {"name": "payload",   "type": "bytes"},
        ],
        "outputs": [{"name": "success", "type": "bool"}],
    },
    {
        "name": "unlockLiquidity",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "riskScore", "type": "uint256"},
            {"name": "payload",   "type": "bytes"},
        ],
        "outputs": [{"name": "success", "type": "bool"}],
    },
    {
        "name": "rebalanceTreasury",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "targetRatio", "type": "uint256"},
            {"name": "varAmount",   "type": "uint256"},
            {"name": "payload",     "type": "bytes"},
        ],
        "outputs": [{"name": "success", "type": "bool"}],
    },
    {
        "name": "emergencyTransfer",
        "type": "function",
        "stateMutability": "nonpayable",
        "inputs": [
            {"name": "recipient", "type": "address"},
            {"name": "amount",    "type": "uint256"},
            {"name": "payload",   "type": "bytes"},
        ],
        "outputs": [{"name": "success", "type": "bool"}],
    },
    {
        "name": "isLocked",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "bool"}],
    },
    {
        "name": "totalProtectedAmount",
        "type": "function",
        "stateMutability": "view",
        "inputs": [],
        "outputs": [{"name": "", "type": "uint256"}],
    },
    # ------------------------------------------------------------------ #
    # Events
    # ------------------------------------------------------------------ #
    {
        "name": "LiquidityLocked",
        "type": "event",
        "inputs": [
            {"name": "oracle",     "type": "address", "indexed": True},
            {"name": "riskScore",  "type": "uint256", "indexed": False},
            {"name": "timestamp",  "type": "uint256", "indexed": False},
        ],
        "anonymous": False,
    },
    {
        "name": "LiquidityUnlocked",
        "type": "event",
        "inputs": [
            {"name": "oracle",     "type": "address", "indexed": True},
            {"name": "riskScore",  "type": "uint256", "indexed": False},
            {"name": "timestamp",  "type": "uint256", "indexed": False},
        ],
        "anonymous": False,
    },
    {
        "name": "TreasuryRebalanced",
        "type": "event",
        "inputs": [
            {"name": "oracle",       "type": "address", "indexed": True},
            {"name": "targetRatio",  "type": "uint256", "indexed": False},
            {"name": "timestamp",    "type": "uint256", "indexed": False},
        ],
        "anonymous": False,
    },
    {
        "name": "EmergencyTransferExecuted",
        "type": "event",
        "inputs": [
            {"name": "oracle",     "type": "address", "indexed": True},
            {"name": "recipient",  "type": "address", "indexed": True},
            {"name": "amount",     "type": "uint256", "indexed": False},
            {"name": "timestamp",  "type": "uint256", "indexed": False},
        ],
        "anonymous": False,
    },
]


class Web3Service:
    """
    Async-friendly wrapper around web3.py for the TreasuryGuard contract.

    Falls back to mock responses when the RPC endpoint is unavailable,
    ensuring the rest of the API stack stays functional.
    """

    def __init__(self) -> None:
        self._w3: Any = None
        self._account: Any = None
        self._contract: Any = None
        self._connected = False
        self._initialise()

    # ------------------------------------------------------------------
    # Initialisation
    # ------------------------------------------------------------------
    def _initialise(self) -> None:
        try:
            from web3 import Web3
            from web3.middleware import ExtraDataToPOAMiddleware

            w3 = Web3(Web3.HTTPProvider(settings.EVM_RPC_URL, request_kwargs={"timeout": 5}))

            # Inject PoA middleware (Polygon, BSC, etc.)
            w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

            if w3.is_connected():
                self._w3 = w3
                self._account = w3.eth.account.from_key(settings.ORACLE_PRIVATE_KEY)

                if settings.CONTRACT_ADDRESS and settings.CONTRACT_ADDRESS != "0x" + "0" * 40:
                    self._contract = w3.eth.contract(
                        address=Web3.to_checksum_address(settings.CONTRACT_ADDRESS),
                        abi=TREASURY_GUARD_ABI,
                    )

                self._connected = True
                logger.info(
                    "Web3Service connected to %s — oracle: %s",
                    settings.EVM_RPC_URL,
                    self._account.address,
                )
            else:
                logger.warning(
                    "Web3Service: cannot reach %s — running in mock mode.",
                    settings.EVM_RPC_URL,
                )
        except Exception as exc:
            logger.warning("Web3Service init failed (%s) — mock mode active.", exc)

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ------------------------------------------------------------------
    # Execute action
    # ------------------------------------------------------------------
    async def execute_action(
        self,
        action: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Sign and broadcast a contract function call for the given *action*.

        Parameters
        ----------
        action  : One of LOCK_LIQUIDITY, UNLOCK_LIQUIDITY,
                  REBALANCE_TREASURY, EMERGENCY_TRANSFER.
        payload : Structured payload dict (serialised to bytes for ABI).

        Returns
        -------
        dict: {tx_hash, block_number, gas_used, status, network}
        """
        if not self._connected or self._contract is None:
            return self._mock_tx_result(action)

        try:
            payload_bytes = json.dumps(payload).encode()
            risk_score_int = int(payload.get("risk", {}).get("probability", 0) * 10_000)
            var_amount_int = int(payload.get("simulation", {}).get("var_95", 0))

            # Build the correct contract function call
            if action == "LOCK_LIQUIDITY":
                fn = self._contract.functions.lockLiquidity(
                    risk_score_int, var_amount_int, payload_bytes
                )
            elif action == "UNLOCK_LIQUIDITY":
                fn = self._contract.functions.unlockLiquidity(
                    risk_score_int, payload_bytes
                )
            elif action == "REBALANCE_TREASURY":
                target_ratio = int(payload.get("simulation", {}).get("var_95", 5000))
                fn = self._contract.functions.rebalanceTreasury(
                    target_ratio, var_amount_int, payload_bytes
                )
            elif action == "EMERGENCY_TRANSFER":
                # Transfer to oracle address itself as safeguard
                fn = self._contract.functions.emergencyTransfer(
                    self._account.address, var_amount_int, payload_bytes
                )
            else:
                return self._mock_tx_result(action, status="skipped")

            # Build, sign, send
            tx = fn.build_transaction(
                {
                    "from": self._account.address,
                    "nonce": self._w3.eth.get_transaction_count(self._account.address),
                    "gas": 200_000,
                    "gasPrice": self._w3.eth.gas_price,
                }
            )
            signed = self._w3.eth.account.sign_transaction(tx, self._account.key)
            tx_hash = self._w3.eth.send_raw_transaction(signed.raw_transaction)
            receipt = self._w3.eth.wait_for_transaction_receipt(tx_hash, timeout=60)

            return {
                "tx_hash": receipt.transactionHash.hex(),
                "block_number": receipt.blockNumber,
                "gas_used": receipt.gasUsed,
                "status": "success" if receipt.status == 1 else "failed",
                "network": settings.EVM_RPC_URL,
            }

        except Exception as exc:
            logger.error("execute_action failed: %s", exc, exc_info=True)
            return self._mock_tx_result(action, status="error")

    # ------------------------------------------------------------------
    # Contract status
    # ------------------------------------------------------------------
    async def get_contract_status(self) -> Dict[str, Any]:
        """
        Query the contract's current state.

        Returns
        -------
        dict: {is_locked, oracle_address, total_protected, block_number}
        """
        if not self._connected or self._contract is None:
            return {
                "is_locked": False,
                "oracle_address": "0x0000000000000000000000000000000000000000",
                "total_protected": 0,
                "block_number": 0,
                "mock": True,
            }
        try:
            is_locked = self._contract.functions.isLocked().call()
            total_protected = self._contract.functions.totalProtectedAmount().call()
            oracle_addr = self._account.address if self._account else "0x0000000000000000000000000000000000000000"
            block_number = self._w3.eth.block_number
            return {
                "is_locked": bool(is_locked),
                "oracle_address": oracle_addr,
                "total_protected": int(total_protected),
                "block_number": block_number,
                "mock": False,
            }
        except Exception as exc:
            logger.error("get_contract_status failed: %s", exc)
            return {
                "is_locked": False,
                "oracle_address": "0x0000000000000000000000000000000000000000",
                "total_protected": 0,
                "block_number": 0,
                "mock": True,
                "error": str(exc),
            }

    # ------------------------------------------------------------------
    # Recent transactions / events
    # ------------------------------------------------------------------
    async def get_recent_transactions(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Fetch recent contract events from the blockchain.

        Returns
        -------
        List of event dicts (up to *limit*).
        """
        if not self._connected or self._contract is None:
            return self._mock_recent_transactions(limit)

        try:
            events: List[Dict[str, Any]] = []
            latest = self._w3.eth.block_number
            from_block = max(0, latest - 5_000)

            event_filters = [
                ("LiquidityLocked",          self._contract.events.LiquidityLocked),
                ("LiquidityUnlocked",        self._contract.events.LiquidityUnlocked),
                ("TreasuryRebalanced",       self._contract.events.TreasuryRebalanced),
                ("EmergencyTransferExecuted",self._contract.events.EmergencyTransferExecuted),
            ]

            for name, evt_cls in event_filters:
                try:
                    logs = evt_cls.get_logs(fromBlock=from_block)
                    for log in logs:
                        events.append(
                            {
                                "event": name,
                                "tx_hash": log.transactionHash.hex(),
                                "block_number": log.blockNumber,
                                "args": dict(log.args),
                            }
                        )
                except Exception:
                    pass

            events.sort(key=lambda e: e["block_number"], reverse=True)
            return events[:limit]

        except Exception as exc:
            logger.error("get_recent_transactions failed: %s", exc)
            return self._mock_recent_transactions(limit)

    # ------------------------------------------------------------------
    # Helpers / mock data
    # ------------------------------------------------------------------
    @staticmethod
    def _mock_tx_result(
        action: str,
        status: str = "mock",
    ) -> Dict[str, Any]:
        fake_hash = "0x" + "ab" * 32
        return {
            "tx_hash": fake_hash,
            "block_number": 0,
            "gas_used": 21_000,
            "status": status,
            "network": settings.EVM_RPC_URL,
            "mock": True,
            "action": action,
        }

    @staticmethod
    def _mock_recent_transactions(limit: int) -> List[Dict[str, Any]]:
        return [
            {
                "event": "LiquidityLocked",
                "tx_hash": f"0x{'00' * 32}",
                "block_number": 1,
                "args": {"oracle": "0x0", "riskScore": 7500, "timestamp": int(time.time())},
                "mock": True,
            }
        ][:limit]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
web3_service = Web3Service()
