"""
Risk analysis router.

Endpoints:
  POST /risk/analyze     — run full Bayesian+MC cycle (Analyst+)
  GET  /risk/latest      — latest RiskPrediction + SimulationResult
  GET  /risk/history     — paginated risk history
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ai.bayesian_network import BayesianRiskNetwork
from ai.decision_engine import DecisionEngine
from ai.monte_carlo import MonteCarloEngine
from core.config import settings
from core.dependencies import get_current_analyst_user, get_current_user, get_db
from db.models import RiskPrediction, SimulationResult, TreasuryMetric, User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/risk", tags=["Risk Analysis"])

# ---------------------------------------------------------------------------
# Module-level AI instances (shared)
# ---------------------------------------------------------------------------
_bayesian = BayesianRiskNetwork()
_mc_engine = MonteCarloEngine(
    n_simulations=settings.MAX_SIMULATIONS,
    horizon_hours=settings.SIMULATION_HORIZON_HOURS,
)
_decision = DecisionEngine()


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------
class RiskAnalyzeRequest(BaseModel):
    liquidity_ratio: float = Field(..., ge=0.0, le=1.0)
    cash_reserves: float = Field(..., ge=0.0)
    debt_exposure: float = Field(..., ge=0.0, le=1.0)
    market_volatility: float = Field(..., ge=0.0, le=1.0)
    counterparty_risk: float = Field(..., ge=0.0, le=1.0)
    anomaly_score: float = Field(default=0.0, ge=0.0, le=1.0)
    total_balance: float = Field(default=10_000_000.0, gt=0)
    source: Optional[str] = Field(default="api", max_length=128)
    trigger_decision: bool = Field(
        default=False,
        description="If true, also evaluate and return the decision output",
    )


class SimulationResultSchema(BaseModel):
    id: Optional[int]
    expected_loss: float
    var_95: float
    var_99: float
    cvar_95: float
    num_simulations: int
    horizon_hours: int
    path_distribution: Optional[Any]

    model_config = {"from_attributes": True}


class RiskPredictionSchema(BaseModel):
    id: Optional[int]
    timestamp: datetime
    risk_level: str
    risk_probability: float
    bayesian_inputs: Optional[Dict[str, Any]]
    model_version: str

    model_config = {"from_attributes": True}


class RiskAnalyzeResponse(BaseModel):
    metric_id: int
    prediction: RiskPredictionSchema
    simulation: SimulationResultSchema
    decision: Optional[Dict[str, Any]]
    timestamp: datetime


class RiskHistoryItem(BaseModel):
    prediction_id: int
    timestamp: datetime
    risk_level: str
    risk_probability: float
    var_95: Optional[float]
    model_version: str

    model_config = {"from_attributes": True}


class PaginatedRiskHistory(BaseModel):
    items: List[RiskHistoryItem]
    total: int
    limit: int


# ---------------------------------------------------------------------------
# POST /risk/analyze
# ---------------------------------------------------------------------------
@router.post(
    "/analyze",
    response_model=RiskAnalyzeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Run full Bayesian + Monte Carlo risk analysis",
)
async def analyze_risk(
    body: RiskAnalyzeRequest,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_analyst_user),
) -> RiskAnalyzeResponse:
    """
    Accept treasury metrics, run Bayesian inference + Monte Carlo simulation,
    persist both results to the DB, and optionally compute a decision.
    """
    # 1. Save metric
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
        db.flush()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error saving metric: {exc}")

    # 2. Bayesian inference
    metric_dict = {
        "liquidity_ratio":   body.liquidity_ratio,
        "cash_reserves":     body.cash_reserves,
        "debt_exposure":     body.debt_exposure,
        "market_volatility": body.market_volatility,
        "counterparty_risk": body.counterparty_risk,
        "anomaly_score":     body.anomaly_score,
    }
    bayesian_output = _bayesian.infer(metric_dict)

    # 3. Save RiskPrediction
    risk_pred = RiskPrediction(
        metric_id=metric.id,
        timestamp=datetime.now(timezone.utc),
        risk_level=bayesian_output["risk_level"],
        risk_probability=bayesian_output["risk_probability"],
        bayesian_inputs=bayesian_output,
        model_version=BayesianRiskNetwork.MODEL_VERSION,
    )
    try:
        db.add(risk_pred)
        db.flush()
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB error saving prediction: {exc}")

    # 4. Monte Carlo simulation
    volatility = max(body.market_volatility, 0.05)
    sim_output = _mc_engine.simulate(
        initial_value=body.total_balance,
        volatility=volatility,
        drift=0.0,
    )

    # 5. Save SimulationResult
    sim_result = SimulationResult(
        prediction_id=risk_pred.id,
        timestamp=datetime.now(timezone.utc),
        num_simulations=sim_output.get("num_simulations", settings.MAX_SIMULATIONS),
        horizon_hours=sim_output.get("horizon_hours", settings.SIMULATION_HORIZON_HOURS),
        expected_loss=sim_output.get("expected_loss", 0.0),
        var_95=sim_output.get("var_95", 0.0),
        var_99=sim_output.get("var_99", 0.0),
        cvar_95=sim_output.get("cvar_95", 0.0),
        path_distribution={"bins": sim_output.get("path_distribution", [])},
    )
    try:
        db.add(sim_result)
        db.commit()
        db.refresh(metric)
        db.refresh(risk_pred)
        db.refresh(sim_result)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"DB commit error: {exc}")

    # 6. Optional decision
    decision_output: Optional[Dict[str, Any]] = None
    if body.trigger_decision:
        from services.web3_service import web3_service
        cs = await web3_service.get_contract_status()
        decision_output = _decision.evaluate(
            risk_prob=bayesian_output["risk_probability"],
            var_95=float(sim_output.get("var_95", 0.0)),
            is_locked=cs.get("is_locked", False),
            var_threshold=settings.VAR_THRESHOLD_USD,
            recovery_threshold=settings.RECOVERY_THRESHOLD,
        )

    prediction_schema = RiskPredictionSchema(
        id=risk_pred.id,
        timestamp=risk_pred.timestamp,
        risk_level=risk_pred.risk_level,
        risk_probability=risk_pred.risk_probability,
        bayesian_inputs=risk_pred.bayesian_inputs,
        model_version=risk_pred.model_version,
    )
    simulation_schema = SimulationResultSchema(
        id=sim_result.id,
        expected_loss=float(sim_result.expected_loss),
        var_95=float(sim_result.var_95),
        var_99=float(sim_result.var_99),
        cvar_95=float(sim_result.cvar_95),
        num_simulations=sim_result.num_simulations,
        horizon_hours=sim_result.horizon_hours,
        path_distribution=sim_result.path_distribution,
    )

    return RiskAnalyzeResponse(
        metric_id=metric.id,
        prediction=prediction_schema,
        simulation=simulation_schema,
        decision=decision_output,
        timestamp=datetime.now(timezone.utc),
    )


# ---------------------------------------------------------------------------
# GET /risk/latest
# ---------------------------------------------------------------------------
@router.get(
    "/latest",
    summary="Latest risk prediction + simulation result",
)
async def get_latest_risk(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Dict[str, Any]:
    """Return the most recent RiskPrediction joined with its SimulationResult."""
    pred: Optional[RiskPrediction] = (
        db.query(RiskPrediction)
        .order_by(RiskPrediction.timestamp.desc())
        .first()
    )
    if pred is None:
        return {"prediction": None, "simulation": None}

    sim: Optional[SimulationResult] = (
        db.query(SimulationResult)
        .filter(SimulationResult.prediction_id == pred.id)
        .order_by(SimulationResult.timestamp.desc())
        .first()
    )

    pred_data = {
        "id": pred.id,
        "timestamp": pred.timestamp.isoformat(),
        "risk_level": pred.risk_level,
        "risk_probability": pred.risk_probability,
        "bayesian_inputs": pred.bayesian_inputs,
        "model_version": pred.model_version,
    }

    sim_data: Optional[Dict[str, Any]] = None
    if sim:
        sim_data = {
            "id": sim.id,
            "expected_loss": float(sim.expected_loss),
            "var_95": float(sim.var_95),
            "var_99": float(sim.var_99),
            "cvar_95": float(sim.cvar_95),
            "num_simulations": sim.num_simulations,
            "horizon_hours": sim.horizon_hours,
            "path_distribution": sim.path_distribution,
        }

    return {"prediction": pred_data, "simulation": sim_data}


# ---------------------------------------------------------------------------
# GET /risk/history
# ---------------------------------------------------------------------------
@router.get(
    "/history",
    response_model=PaginatedRiskHistory,
    summary="Paginated risk prediction history",
)
async def get_risk_history(
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> PaginatedRiskHistory:
    """Return paginated risk predictions, newest first."""
    total: int = db.query(RiskPrediction).count()
    rows: List[RiskPrediction] = (
        db.query(RiskPrediction)
        .order_by(RiskPrediction.timestamp.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    items = []
    for row in rows:
        latest_sim: Optional[SimulationResult] = (
            db.query(SimulationResult)
            .filter(SimulationResult.prediction_id == row.id)
            .order_by(SimulationResult.timestamp.desc())
            .first()
        )
        items.append(
            RiskHistoryItem(
                prediction_id=row.id,
                timestamp=row.timestamp,
                risk_level=row.risk_level,
                risk_probability=row.risk_probability,
                var_95=float(latest_sim.var_95) if latest_sim else None,
                model_version=row.model_version,
            )
        )

    return PaginatedRiskHistory(items=items, total=total, limit=limit)
