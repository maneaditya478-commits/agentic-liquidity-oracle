"""
Autonomous Treasury Agent.

Orchestrates:
  BayesianRiskNetwork → MonteCarloEngine → DecisionEngine
  → web3_service → icp_service → WebSocket broadcast

Runs as a background APScheduler job every N seconds.
Implements a circuit breaker: pauses auto-execution after 3 consecutive
blockchain failures.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy.orm import Session

from ai.bayesian_network import BayesianRiskNetwork
from ai.decision_engine import ACTION_NONE, DecisionEngine
from ai.monte_carlo import MonteCarloEngine
from core.config import settings
from db.models import AuditRecord, BlockchainTransaction, RiskPrediction, SimulationResult, TreasuryMetric
from services.icp_service import icp_service
from services.web3_service import web3_service
from services.ws_manager import manager as ws_manager

logger = logging.getLogger(__name__)


class TreasuryAgent:
    """
    Autonomous AI agent that periodically analyses treasury state and
    executes protective actions on-chain when risk thresholds are breached.

    Circuit Breaker
    ---------------
    After ``MAX_CONSECUTIVE_FAILURES`` consecutive blockchain failures the
    agent pauses automatic on-chain execution.  Manual calls to
    ``run_cycle()`` still work and will log warnings.
    """

    MAX_CONSECUTIVE_FAILURES: int = 3

    def __init__(self) -> None:
        self._bayesian = BayesianRiskNetwork()
        self._monte_carlo = MonteCarloEngine(
            n_simulations=settings.MAX_SIMULATIONS,
            horizon_hours=settings.SIMULATION_HORIZON_HOURS,
        )
        self._decision = DecisionEngine()
        self._scheduler = AsyncIOScheduler()
        self._consecutive_failures: int = 0
        self._blockchain_paused: bool = False
        self._running: bool = False
        self._last_cycle_result: Optional[Dict[str, Any]] = None

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------
    async def start(self) -> None:
        """Start the APScheduler background job."""
        if self._running:
            return
        self._scheduler.add_job(
            self._scheduled_cycle,
            trigger="interval",
            seconds=settings.AGENT_POLL_INTERVAL_SECONDS,
            id="treasury_agent_cycle",
            max_instances=1,
            coalesce=True,
        )
        self._scheduler.start()
        self._running = True
        logger.info(
            "TreasuryAgent started — interval: %ds",
            settings.AGENT_POLL_INTERVAL_SECONDS,
        )

    async def stop(self) -> None:
        """Shut down the APScheduler."""
        if self._running and self._scheduler.running:
            self._scheduler.shutdown(wait=False)
        self._running = False
        logger.info("TreasuryAgent stopped.")

    # ------------------------------------------------------------------
    # Scheduled wrapper
    # ------------------------------------------------------------------
    async def _scheduled_cycle(self) -> None:
        """Called by APScheduler — creates its own DB session."""
        from db.database import SessionLocal  # late import to avoid circular

        db: Session = SessionLocal()
        try:
            result = await self.run_cycle(db)
            self._last_cycle_result = result
        except Exception as exc:
            logger.error("Scheduled cycle error: %s", exc, exc_info=True)
        finally:
            db.close()

    # ------------------------------------------------------------------
    # Core cycle
    # ------------------------------------------------------------------
    async def run_cycle(self, db_session: Session) -> Dict[str, Any]:
        """
        Execute one full risk assessment and decision cycle.

        Steps
        -----
        1. Load latest TreasuryMetric from DB.
        2. Run Bayesian inference.
        3. Save RiskPrediction.
        4. Run Monte Carlo simulation.
        5. Save SimulationResult.
        6. Evaluate decision.
        7. If action needed: call web3_service.execute_action().
        8. Save BlockchainTransaction and AuditRecord.
        9. Broadcast result via WebSocket.
        10. Return full cycle result dict.

        Returns
        -------
        dict with all cycle outputs.
        """
        result: Dict[str, Any] = {
            "cycle_timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "ok",
        }

        # ----------------------------------------------------------------
        # Step 1: Load latest treasury metric
        # ----------------------------------------------------------------
        metric: Optional[TreasuryMetric] = (
            db_session.query(TreasuryMetric)
            .order_by(TreasuryMetric.timestamp.desc())
            .first()
        )

        if metric is None:
            logger.warning("No TreasuryMetric found — using synthetic defaults.")
            metric_dict = self._default_metrics()
            total_balance = 10_000_000.0
        else:
            metric_dict = {
                "liquidity_ratio":   float(metric.liquidity_ratio),
                "cash_reserves":     float(metric.cash_reserves),
                "debt_exposure":     float(metric.debt_exposure),
                "market_volatility": float(metric.market_volatility),
                "counterparty_risk": float(metric.counterparty_risk),
                "anomaly_score":     float(metric.anomaly_score),
            }
            total_balance = float(metric.total_balance)

        result["metric_id"] = metric.id if metric else None

        # ----------------------------------------------------------------
        # Step 2: Bayesian inference
        # ----------------------------------------------------------------
        bayesian_output = self._bayesian.infer(metric_dict)
        risk_level = bayesian_output["risk_level"]
        risk_prob = bayesian_output["risk_probability"]
        result["bayesian"] = bayesian_output

        # ----------------------------------------------------------------
        # Step 3: Save RiskPrediction
        # ----------------------------------------------------------------
        risk_pred: Optional[RiskPrediction] = None
        if metric is not None:
            try:
                risk_pred = RiskPrediction(
                    metric_id=metric.id,
                    timestamp=datetime.now(timezone.utc),
                    risk_level=risk_level,
                    risk_probability=risk_prob,
                    bayesian_inputs=bayesian_output,
                    model_version=BayesianRiskNetwork.MODEL_VERSION,
                )
                db_session.add(risk_pred)
                db_session.flush()
                result["risk_prediction_id"] = risk_pred.id
            except Exception as exc:
                logger.error("Failed to save RiskPrediction: %s", exc)
                db_session.rollback()

        # ----------------------------------------------------------------
        # Step 4: Monte Carlo simulation
        # ----------------------------------------------------------------
        volatility = float(metric_dict.get("market_volatility", 0.20))
        sim_output = self._monte_carlo.simulate(
            initial_value=total_balance,
            volatility=max(volatility, 0.05),
            drift=0.0,
        )
        result["simulation"] = sim_output

        # ----------------------------------------------------------------
        # Step 5: Save SimulationResult
        # ----------------------------------------------------------------
        sim_result: Optional[SimulationResult] = None
        if risk_pred is not None:
            try:
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
                db_session.add(sim_result)
                db_session.flush()
                result["simulation_id"] = sim_result.id
            except Exception as exc:
                logger.error("Failed to save SimulationResult: %s", exc)
                db_session.rollback()

        # ----------------------------------------------------------------
        # Step 6: Evaluate decision
        # ----------------------------------------------------------------
        contract_status = await web3_service.get_contract_status()
        is_locked = contract_status.get("is_locked", False)

        decision = self._decision.evaluate(
            risk_prob=risk_prob,
            var_95=float(sim_output.get("var_95", 0.0)),
            is_locked=is_locked,
            var_threshold=settings.VAR_THRESHOLD_USD,
            recovery_threshold=settings.RECOVERY_THRESHOLD,
        )
        action = decision["action"]
        result["decision"] = decision

        # ----------------------------------------------------------------
        # Step 7: Execute blockchain action (if needed)
        # ----------------------------------------------------------------
        bc_tx: Optional[BlockchainTransaction] = None
        tx_result: Dict[str, Any] = {}

        if action != ACTION_NONE:
            if self._blockchain_paused:
                logger.warning(
                    "Blockchain execution paused (circuit breaker). "
                    "Action %s NOT sent.",
                    action,
                )
                result["blockchain_paused"] = True
            else:
                payload = self._decision.generate_payload(bayesian_output, sim_output, action)
                try:
                    tx_result = await web3_service.execute_action(action, payload)
                    tx_status = tx_result.get("status", "unknown")

                    if tx_status in ("success", "mock"):
                        self._consecutive_failures = 0
                        self._blockchain_paused = False
                    else:
                        self._consecutive_failures += 1
                        if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES:
                            self._blockchain_paused = True
                            logger.critical(
                                "Circuit breaker OPEN: %d consecutive blockchain failures.",
                                self._consecutive_failures,
                            )

                except Exception as exc:
                    logger.error("execute_action raised: %s", exc)
                    self._consecutive_failures += 1
                    if self._consecutive_failures >= self.MAX_CONSECUTIVE_FAILURES:
                        self._blockchain_paused = True
                    tx_result = {"tx_hash": None, "block_number": None, "gas_used": None, "status": "error"}

                result["tx_result"] = tx_result

        # ----------------------------------------------------------------
        # Step 8: Save BlockchainTransaction + AuditRecord
        # ----------------------------------------------------------------
        try:
            bc_tx = BlockchainTransaction(
                simulation_id=sim_result.id if sim_result else None,
                timestamp=datetime.now(timezone.utc),
                action=action,
                tx_hash=tx_result.get("tx_hash"),
                block_number=tx_result.get("block_number"),
                gas_used=tx_result.get("gas_used"),
                status=tx_result.get("status", "no_action"),
                network=settings.EVM_RPC_URL,
                oracle_signature=None,
            )
            db_session.add(bc_tx)
            db_session.flush()

            icp_record_id: Optional[int] = None
            try:
                icp_payload = {
                    "risk_level": risk_level,
                    "risk_probability": risk_prob,
                    "var_95": float(sim_output.get("var_95", 0.0)),
                    "action": action,
                    "tx_hash": tx_result.get("tx_hash"),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                icp_record_id = await icp_service.add_record(icp_payload)
            except Exception as exc:
                logger.error("ICP record failed: %s", exc)

            audit = AuditRecord(
                tx_id=bc_tx.id,
                timestamp=datetime.now(timezone.utc),
                risk_score=risk_prob,
                var_95=float(sim_output.get("var_95", 0.0)),
                confidence=decision.get("confidence", 0.0),
                action=action,
                tx_hash=tx_result.get("tx_hash"),
                icp_record_id=icp_record_id,
                summary=(
                    f"[{risk_level}] rp={risk_prob:.2%} "
                    f"VaR95=${float(sim_output.get('var_95', 0)):.0f} "
                    f"action={action}"
                ),
            )
            db_session.add(audit)
            db_session.commit()
            result["audit_id"] = audit.id
            result["bc_tx_id"] = bc_tx.id

        except Exception as exc:
            logger.error("Failed to save blockchain/audit records: %s", exc)
            db_session.rollback()

        # ----------------------------------------------------------------
        # Step 9: Broadcast via WebSocket
        # ----------------------------------------------------------------
        ws_payload = {
            "type": "cycle_update",
            "timestamp": result["cycle_timestamp"],
            "risk_level": risk_level,
            "risk_probability": risk_prob,
            "var_95": sim_output.get("var_95", 0.0),
            "action": action,
            "severity": decision.get("severity", "INFO"),
            "is_locked": is_locked,
            "circuit_breaker_open": self._blockchain_paused,
        }
        await ws_manager.broadcast(ws_payload)

        logger.info(
            "Cycle complete — level=%s prob=%.2f action=%s",
            risk_level,
            risk_prob,
            action,
        )
        return result

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _default_metrics() -> Dict[str, float]:
        """Synthetic safe defaults when no DB records exist."""
        return {
            "liquidity_ratio":   0.70,
            "cash_reserves":     0.65,
            "debt_exposure":     0.25,
            "market_volatility": 0.15,
            "counterparty_risk": 0.20,
            "anomaly_score":     0.05,
        }

    @property
    def last_cycle_result(self) -> Optional[Dict[str, Any]]:
        return self._last_cycle_result

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def circuit_breaker_open(self) -> bool:
        return self._blockchain_paused

    def reset_circuit_breaker(self) -> None:
        """Manually reset the circuit breaker (admin action)."""
        self._consecutive_failures = 0
        self._blockchain_paused = False
        logger.info("Circuit breaker manually reset.")


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
treasury_agent = TreasuryAgent()
