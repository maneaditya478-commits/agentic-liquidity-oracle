"""
Decision Engine: maps risk/simulation data to treasury actions.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Action constants
# ---------------------------------------------------------------------------
ACTION_LOCK_LIQUIDITY: str = "LOCK_LIQUIDITY"
ACTION_UNLOCK_LIQUIDITY: str = "UNLOCK_LIQUIDITY"
ACTION_REBALANCE_TREASURY: str = "REBALANCE_TREASURY"
ACTION_EMERGENCY_TRANSFER: str = "EMERGENCY_TRANSFER"
ACTION_NONE: str = "NONE"

ALL_ACTIONS = (
    ACTION_LOCK_LIQUIDITY,
    ACTION_UNLOCK_LIQUIDITY,
    ACTION_REBALANCE_TREASURY,
    ACTION_EMERGENCY_TRANSFER,
    ACTION_NONE,
)


class DecisionEngine:
    """
    Rule-based decision engine that maps Bayesian + Monte Carlo outputs
    to an executable treasury action.

    Decision matrix
    ---------------
    1. is_locked AND risk_prob < recovery_threshold → UNLOCK_LIQUIDITY
    2. risk_prob >= 0.80 AND var_95 > var_threshold*1.5 → EMERGENCY_TRANSFER
    3. risk_prob >= 0.80 → LOCK_LIQUIDITY
    4. risk_prob >= 0.60 AND var_95 > var_threshold → REBALANCE_TREASURY
    5. else → NONE
    """

    def evaluate(
        self,
        risk_prob: float,
        var_95: float,
        is_locked: bool,
        var_threshold: float,
        recovery_threshold: float,
    ) -> Dict[str, Any]:
        """
        Evaluate the decision matrix and return the recommended action.

        Parameters
        ----------
        risk_prob           : Composite risk probability [0, 1].
        var_95              : 95 % Value-at-Risk in USD.
        is_locked           : Whether liquidity is currently locked on-chain.
        var_threshold       : USD threshold for triggering rebalance/emergency.
        recovery_threshold  : Risk probability below which unlocking is safe.

        Returns
        -------
        dict with:
            action     – str (action constant)
            reasoning  – str (human-readable explanation)
            severity   – str (INFO / WARNING / HIGH / CRITICAL)
            confidence – float [0, 1]
        """
        try:
            rp = float(risk_prob)
            v95 = float(var_95)
            vt = float(var_threshold)
            rt = float(recovery_threshold)
        except (TypeError, ValueError) as exc:
            logger.error("DecisionEngine.evaluate received bad input: %s", exc)
            return self._build_result(
                ACTION_NONE,
                "Invalid inputs; defaulting to no-action",
                "INFO",
                0.0,
            )

        # --- Rule 1: Unlock when locked and risk has dropped ---------------
        if is_locked and rp < rt:
            return self._build_result(
                ACTION_UNLOCK_LIQUIDITY,
                (
                    f"Risk probability ({rp:.2%}) has dropped below recovery "
                    f"threshold ({rt:.2%}). Safe to unlock liquidity."
                ),
                "INFO",
                round(1.0 - rp, 3),
            )

        # --- Rule 2: Emergency transfer (severe) ---------------------------
        if rp >= 0.80 and v95 > vt * 1.5:
            return self._build_result(
                ACTION_EMERGENCY_TRANSFER,
                (
                    f"CRITICAL: Risk probability {rp:.2%} and VaR-95 "
                    f"${v95:,.0f} exceeds emergency threshold "
                    f"${vt * 1.5:,.0f}. Initiating emergency transfer."
                ),
                "CRITICAL",
                round(rp, 3),
            )

        # --- Rule 3: Lock liquidity (high risk) ----------------------------
        if rp >= 0.80:
            return self._build_result(
                ACTION_LOCK_LIQUIDITY,
                (
                    f"High risk probability ({rp:.2%} ≥ 80 %). "
                    "Locking liquidity to prevent further exposure."
                ),
                "HIGH",
                round(rp, 3),
            )

        # --- Rule 4: Rebalance (elevated risk + VaR breach) ----------------
        if rp >= 0.60 and v95 > vt:
            return self._build_result(
                ACTION_REBALANCE_TREASURY,
                (
                    f"Elevated risk ({rp:.2%}) with VaR-95 ${v95:,.0f} "
                    f"exceeding threshold ${vt:,.0f}. "
                    "Triggering treasury rebalance."
                ),
                "WARNING",
                round(rp, 3),
            )

        # --- Default: No action --------------------------------------------
        return self._build_result(
            ACTION_NONE,
            (
                f"Risk probability ({rp:.2%}) and VaR-95 (${v95:,.0f}) "
                "within acceptable bounds. No action required."
            ),
            "INFO",
            round(1.0 - rp, 3),
        )

    @staticmethod
    def _build_result(
        action: str,
        reasoning: str,
        severity: str,
        confidence: float,
    ) -> Dict[str, Any]:
        return {
            "action": action,
            "reasoning": reasoning,
            "severity": severity,
            "confidence": float(_np.clip(confidence, 0.0, 1.0)) if _np_available else max(0.0, min(1.0, confidence)),
        }

    # ------------------------------------------------------------------
    # Payload generation for blockchain
    # ------------------------------------------------------------------
    def generate_payload(
        self,
        risk_data: Dict[str, Any],
        sim_data: Dict[str, Any],
        action: str,
    ) -> Dict[str, Any]:
        """
        Build the full JSON payload sent to the smart contract oracle call.

        Parameters
        ----------
        risk_data : Output from BayesianRiskNetwork.infer().
        sim_data  : Output from MonteCarloEngine.simulate().
        action    : Action string constant.

        Returns
        -------
        dict ready to be ABI-encoded for on-chain submission.
        """
        return {
            "action": action,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "risk": {
                "level": risk_data.get("risk_level", "UNKNOWN"),
                "probability": risk_data.get("risk_probability", 0.0),
                "state_probabilities": risk_data.get("state_probabilities", {}),
            },
            "simulation": {
                "expected_loss": sim_data.get("expected_loss", 0.0),
                "var_95": sim_data.get("var_95", 0.0),
                "var_99": sim_data.get("var_99", 0.0),
                "cvar_95": sim_data.get("cvar_95", 0.0),
                "horizon_hours": sim_data.get("horizon_hours", 48),
                "num_simulations": sim_data.get("num_simulations", 0),
            },
            "version": "1.0.0",
        }


# ---------------------------------------------------------------------------
# Optional numpy import for clipping
# ---------------------------------------------------------------------------
try:
    import numpy as _np
    _np_available = True
except ImportError:
    _np_available = False
