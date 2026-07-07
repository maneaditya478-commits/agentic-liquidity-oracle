"""
Treasury router.

Endpoints:
  GET  /treasury/status             — latest metric + risk + lock status
  POST /treasury/metrics            — ingest new metric (Admin)
  GET  /treasury/metrics/history    — paginated historical metrics (JWT)
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from core.dependencies import get_current_admin_user, get_current_user, get_db
from db.models import TreasuryMetric, User
from services.web3_service import web3_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/treasury", tags=["Treasury"])


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class TreasuryMetricCreate(BaseModel):
    total_balance: float = Field(..., gt=0, description="Total treasury balance in USD")
    liquidity_ratio: float = Field(..., ge=0.0, le=1.0)
    cash_reserves: float = Field(..., ge=0.0)
    debt_exposure: float = Field(..., ge=0.0, le=1.0)
    market_volatility: float = Field(..., ge=0.0, le=1.0)
    counterparty_risk: float = Field(..., ge=0.0, le=1.0)
    anomaly_score: float = Field(default=0.0, ge=0.0, le=1.0)
    source: Optional[str] = Field(default="manual", max_length=128)


class TreasuryMetricResponse(BaseModel):
    id: int
    timestamp: datetime
    total_balance: float
    liquidity_ratio: float
    cash_reserves: float
    debt_exposure: float
    market_volatility: float
    counterparty_risk: float
    anomaly_score: float
    source: Optional[str]

    model_config = {"from_attributes": True}


class TreasuryStatusResponse(BaseModel):
    metric: Optional[TreasuryMetricResponse]
    risk_level: str
    risk_probability: float
    is_locked: bool
    var_95: float
    oracle_address: str
    total_protected: int
    block_number: int
    connection_mock: bool
    timestamp: datetime


class PaginatedMetrics(BaseModel):
    items: List[TreasuryMetricResponse]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# GET /treasury/status
# ---------------------------------------------------------------------------
@router.get("/status", response_model=TreasuryStatusResponse, summary="Current treasury status")
async def get_treasury_status(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> TreasuryStatusResponse:
    """
    Return the latest treasury metric snapshot combined with blockchain
    lock status from the TreasuryGuard contract.
    """
    latest: Optional[TreasuryMetric] = (
        db.query(TreasuryMetric)
        .order_by(TreasuryMetric.timestamp.desc())
        .first()
    )

    from db.models import RiskPrediction, SimulationResult
    latest_pred = db.query(RiskPrediction).order_by(RiskPrediction.timestamp.desc()).first()
    latest_sim = db.query(SimulationResult).order_by(SimulationResult.timestamp.desc()).first()

    contract_status = await web3_service.get_contract_status()

    return TreasuryStatusResponse(
        metric=TreasuryMetricResponse.model_validate(latest) if latest else None,
        risk_level=latest_pred.risk_level if latest_pred else "LOW",
        risk_probability=latest_pred.risk_probability if latest_pred else 0.0,
        is_locked=contract_status.get("is_locked", False),
        var_95=float(latest_sim.var_95) if latest_sim else 0.0,
        oracle_address=contract_status.get("oracle_address", "0x0"),
        total_protected=contract_status.get("total_protected", 0),
        block_number=contract_status.get("block_number", 0),
        connection_mock=contract_status.get("mock", True),
        timestamp=datetime.now(timezone.utc),
    )


def ensure_initial_metric_exists(db: Session) -> None:
    """Seed the database with an initial TreasuryMetric if none exists."""
    existing = db.query(TreasuryMetric).first()
    if existing is None:
        metric = TreasuryMetric(
            total_balance=10_000_000.0,
            liquidity_ratio=0.70,
            cash_reserves=6_500_000.0,
            debt_exposure=0.25,
            market_volatility=0.15,
            counterparty_risk=0.20,
            anomaly_score=0.05,
            source="system_seed",
            timestamp=datetime.now(timezone.utc),
        )
        db.add(metric)
        db.commit()
        logger.info("Initial seed TreasuryMetric created.")


# ---------------------------------------------------------------------------
# POST /treasury/metrics
# ---------------------------------------------------------------------------
@router.post(
    "/metrics",
    response_model=TreasuryMetricResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest a treasury metric snapshot (Admin)",
)
async def create_metric(
    body: TreasuryMetricCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin_user),
) -> TreasuryMetricResponse:
    """
    Accept a full treasury metrics payload and persist it to the database.
    Triggers no AI cycle — use **/risk/analyze** for that.
    """
    metric = TreasuryMetric(
        timestamp=datetime.now(timezone.utc),
        total_balance=body.total_balance,
        liquidity_ratio=body.liquidity_ratio,
        cash_reserves=body.cash_reserves,
        debt_exposure=body.debt_exposure,
        market_volatility=body.market_volatility,
        counterparty_risk=body.counterparty_risk,
        anomaly_score=body.anomaly_score,
        source=body.source,
    )
    try:
        db.add(metric)
        db.commit()
        db.refresh(metric)
        logger.info("TreasuryMetric #%d saved (source=%s)", metric.id, metric.source)
    except Exception as exc:
        db.rollback()
        logger.error("Failed to save TreasuryMetric: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save treasury metric",
        )

    return TreasuryMetricResponse.model_validate(metric)


# ---------------------------------------------------------------------------
# GET /treasury/metrics/history
# ---------------------------------------------------------------------------
@router.get(
    "/metrics/history",
    response_model=PaginatedMetrics,
    summary="Paginated historical treasury metrics",
)
async def get_metrics_history(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedMetrics:
    """Return paginated treasury metrics, newest first."""
    total: int = db.query(TreasuryMetric).count()
    items: List[TreasuryMetric] = (
        db.query(TreasuryMetric)
        .order_by(TreasuryMetric.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return PaginatedMetrics(
        items=[TreasuryMetricResponse.model_validate(m) for m in items],
        total=total,
        limit=limit,
        offset=offset,
    )
