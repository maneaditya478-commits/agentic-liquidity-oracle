"""
Decision execution router.

Endpoints:
  POST /decision/execute   — execute a treasury action (Admin)
  GET  /decision/history   — past blockchain transactions (JWT)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ai.decision_engine import ALL_ACTIONS, ACTION_NONE, DecisionEngine
from core.config import settings
from core.dependencies import get_current_admin_user, get_current_user, get_db
from db.models import AuditRecord, BlockchainTransaction, SimulationResult, User
from services.icp_service import icp_service
from services.web3_service import web3_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/decision", tags=["Decision Engine"])

_decision_engine = DecisionEngine()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class ExecuteDecisionRequest(BaseModel):
    action: str = Field(
        ...,
        description=(
            "One of: LOCK_LIQUIDITY, UNLOCK_LIQUIDITY, "
            "REBALANCE_TREASURY, EMERGENCY_TRANSFER"
        ),
    )
    risk_probability: float = Field(..., ge=0.0, le=1.0)
    var_95: float = Field(..., ge=0.0)
    simulation_id: Optional[int] = Field(
        default=None,
        description="Optional SimulationResult ID to link this transaction to",
    )
    override_reason: Optional[str] = Field(
        default=None,
        max_length=512,
        description="Required human-readable reason for manual override",
    )


class BlockchainTxResponse(BaseModel):
    id: int
    timestamp: datetime
    action: str
    tx_hash: Optional[str]
    block_number: Optional[int]
    gas_used: Optional[int]
    status: str
    network: str
    simulation_id: Optional[int]

    model_config = {"from_attributes": True}


class ExecuteDecisionResponse(BaseModel):
    transaction: BlockchainTxResponse
    audit_id: Optional[int]
    icp_record_id: Optional[int]
    payload_sent: Dict[str, Any]
    tx_result: Dict[str, Any]


class PaginatedTransactions(BaseModel):
    items: List[BlockchainTxResponse]
    total: int
    limit: int


# ---------------------------------------------------------------------------
# POST /decision/execute
# ---------------------------------------------------------------------------
@router.post(
    "/execute",
    response_model=ExecuteDecisionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Manually execute a treasury action (Admin only)",
)
async def execute_decision(
    body: ExecuteDecisionRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user),
) -> ExecuteDecisionResponse:
    """
    Validate and execute a treasury protective action via the TreasuryGuard
    smart contract.  Records a BlockchainTransaction and AuditRecord.
    """
    # --- Validate action --------------------------------------------------
    if body.action not in ALL_ACTIONS or body.action == ACTION_NONE:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid action '{body.action}'. Valid: {[a for a in ALL_ACTIONS if a != ACTION_NONE]}",
        )

    # --- Build payload for on-chain call ----------------------------------
    sim_data: Dict[str, Any] = {"var_95": body.var_95}
    if body.simulation_id:
        sim: Optional[SimulationResult] = db.query(SimulationResult).get(body.simulation_id)
        if sim:
            sim_data = {
                "expected_loss": float(sim.expected_loss),
                "var_95": float(sim.var_95),
                "var_99": float(sim.var_99),
                "cvar_95": float(sim.cvar_95),
                "horizon_hours": sim.horizon_hours,
                "num_simulations": sim.num_simulations,
            }

    risk_data: Dict[str, Any] = {
        "risk_probability": body.risk_probability,
        "risk_level": _infer_risk_level(body.risk_probability),
    }
    payload = _decision_engine.generate_payload(risk_data, sim_data, body.action)
    if body.override_reason:
        payload["override_reason"] = body.override_reason
    payload["triggered_by"] = admin.username

    # --- Execute on-chain -------------------------------------------------
    tx_result: Dict[str, Any] = await web3_service.execute_action(body.action, payload)

    # --- Persist BlockchainTransaction ------------------------------------
    bc_tx = BlockchainTransaction(
        simulation_id=body.simulation_id,
        timestamp=datetime.now(timezone.utc),
        action=body.action,
        tx_hash=tx_result.get("tx_hash"),
        block_number=tx_result.get("block_number"),
        gas_used=tx_result.get("gas_used"),
        status=tx_result.get("status", "unknown"),
        network=settings.EVM_RPC_URL,
        oracle_signature=None,
    )
    try:
        db.add(bc_tx)
        db.flush()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to persist transaction: {exc}",
        )

    # --- ICP audit log ----------------------------------------------------
    icp_record_id: Optional[int] = None
    try:
        icp_payload = {
            "action": body.action,
            "risk_probability": body.risk_probability,
            "var_95": body.var_95,
            "tx_hash": tx_result.get("tx_hash"),
            "triggered_by": admin.username,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        icp_record_id = await icp_service.add_record(icp_payload)
    except Exception as exc:
        logger.error("ICP record failed in execute_decision: %s", exc)

    # --- Persist AuditRecord ----------------------------------------------
    audit = AuditRecord(
        tx_id=bc_tx.id,
        timestamp=datetime.now(timezone.utc),
        risk_score=body.risk_probability,
        var_95=body.var_95,
        confidence=1.0,  # manual admin override
        action=body.action,
        tx_hash=tx_result.get("tx_hash"),
        icp_record_id=icp_record_id,
        summary=(
            f"Manual override by {admin.username}: {body.action} | "
            f"rp={body.risk_probability:.2%} VaR95=${body.var_95:.0f}"
        ),
    )
    try:
        db.add(audit)
        db.commit()
        db.refresh(bc_tx)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DB commit error: {exc}",
        )

    return ExecuteDecisionResponse(
        transaction=BlockchainTxResponse.model_validate(bc_tx),
        audit_id=audit.id,
        icp_record_id=icp_record_id,
        payload_sent=payload,
        tx_result=tx_result,
    )


# ---------------------------------------------------------------------------
# GET /decision/history
# ---------------------------------------------------------------------------
@router.get(
    "/history",
    response_model=PaginatedTransactions,
    summary="Past blockchain transactions",
)
async def get_decision_history(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedTransactions:
    """Return paginated blockchain transaction history, newest first."""
    total: int = db.query(BlockchainTransaction).count()
    rows: List[BlockchainTransaction] = (
        db.query(BlockchainTransaction)
        .order_by(BlockchainTransaction.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return PaginatedTransactions(
        items=[BlockchainTxResponse.model_validate(r) for r in rows],
        total=total,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------
def _infer_risk_level(prob: float) -> str:
    if prob >= 0.80:
        return "CRITICAL"
    elif prob >= 0.60:
        return "HIGH"
    elif prob >= 0.35:
        return "MEDIUM"
    return "LOW"
