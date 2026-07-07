"""
Bayesian Risk Network using pgmpy.

6 input nodes (continuous → discretized to LOW/MEDIUM/HIGH):
    LiquidityRatio, CashReserves, DebtExposure,
    MarketVolatility, CounterpartyRisk, AnomalyScore

2 intermediate nodes (LOW/MEDIUM/HIGH):
    FinancialStress, MarketStress

1 output node (LOW/MEDIUM/HIGH/CRITICAL):
    RiskLevel

Inference via VariableElimination.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Attempt pgmpy import; fall back to stub when package unavailable
# ---------------------------------------------------------------------------
try:
    from pgmpy.models import BayesianNetwork
    from pgmpy.factors.discrete import TabularCPD
    from pgmpy.inference import VariableElimination

    _PGMPY_AVAILABLE = True
except ImportError:  # pragma: no cover
    _PGMPY_AVAILABLE = False
    logger.warning("pgmpy not available – BayesianRiskNetwork will use heuristic fallback.")

# ---------------------------------------------------------------------------
# Discrete state labels
# ---------------------------------------------------------------------------
_STATES_LMH = ["LOW", "MEDIUM", "HIGH"]          # 3 states
_STATES_RISK = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]  # 4 states

# Index helpers
_IDX_LMH = {s: i for i, s in enumerate(_STATES_LMH)}
_IDX_RISK = {s: i for i, s in enumerate(_STATES_RISK)}


class BayesianRiskNetwork:
    """
    Discrete Bayesian Network for treasury risk assessment.

    All input metrics are expected in the [0.0, 1.0] range. They are
    discretised into LOW / MEDIUM / HIGH bins before being fed to the
    network.
    """

    MODEL_VERSION = "1.0.0"

    # Discretisation thresholds (low_upper, high_lower)
    _THRESHOLDS: Dict[str, Tuple[float, float]] = {
        # lower threshold → LOW; upper threshold → HIGH; between → MEDIUM
        "LiquidityRatio":    (0.40, 0.70),   # high liquidity is GOOD → inverted
        "CashReserves":      (0.30, 0.60),   # high cash is GOOD → inverted
        "DebtExposure":      (0.30, 0.60),   # high debt is BAD  → direct
        "MarketVolatility":  (0.30, 0.60),   # high volatility is BAD → direct
        "CounterpartyRisk":  (0.30, 0.60),   # high cpr is BAD → direct
        "AnomalyScore":      (0.20, 0.50),   # high anomaly is BAD → direct
    }

    # For LiquidityRatio and CashReserves a HIGH value is GOOD (low stress)
    _INVERT_NODES = {"LiquidityRatio", "CashReserves"}

    def __init__(self) -> None:
        self._model: Any = None
        self._inference: Any = None
        self._ready = False

        if _PGMPY_AVAILABLE:
            try:
                self._build_model()
                self._ready = True
                logger.info("BayesianRiskNetwork initialised successfully.")
            except Exception as exc:
                logger.error("Failed to build Bayesian model: %s", exc, exc_info=True)

    # ------------------------------------------------------------------
    # Model construction
    # ------------------------------------------------------------------
    def _build_model(self) -> None:
        """Construct DAG, attach CPDs, validate, and create inference engine."""

        edges = [
            ("LiquidityRatio",   "FinancialStress"),
            ("CashReserves",     "FinancialStress"),
            ("DebtExposure",     "FinancialStress"),
            ("MarketVolatility", "MarketStress"),
            ("CounterpartyRisk", "MarketStress"),
            ("AnomalyScore",     "MarketStress"),
            ("FinancialStress",  "RiskLevel"),
            ("MarketStress",     "RiskLevel"),
        ]

        model = BayesianNetwork(edges)

        # ---- Prior CPDs for leaf nodes (uniform-ish, slightly biased) -----

        # LiquidityRatio prior: slightly weighted toward MEDIUM
        cpd_liq = TabularCPD(
            variable="LiquidityRatio",
            variable_card=3,
            values=[[0.30], [0.45], [0.25]],
            state_names={"LiquidityRatio": _STATES_LMH},
        )

        cpd_cash = TabularCPD(
            variable="CashReserves",
            variable_card=3,
            values=[[0.25], [0.50], [0.25]],
            state_names={"CashReserves": _STATES_LMH},
        )

        cpd_debt = TabularCPD(
            variable="DebtExposure",
            variable_card=3,
            values=[[0.40], [0.40], [0.20]],
            state_names={"DebtExposure": _STATES_LMH},
        )

        cpd_vol = TabularCPD(
            variable="MarketVolatility",
            variable_card=3,
            values=[[0.40], [0.40], [0.20]],
            state_names={"MarketVolatility": _STATES_LMH},
        )

        cpd_cpr = TabularCPD(
            variable="CounterpartyRisk",
            variable_card=3,
            values=[[0.45], [0.35], [0.20]],
            state_names={"CounterpartyRisk": _STATES_LMH},
        )

        cpd_anom = TabularCPD(
            variable="AnomalyScore",
            variable_card=3,
            values=[[0.60], [0.30], [0.10]],
            state_names={"AnomalyScore": _STATES_LMH},
        )

        # ---- FinancialStress CPD -------------------------------------------
        # Parents: LiquidityRatio(3) x CashReserves(3) x DebtExposure(3) = 27 combos
        # For LiquidityRatio & CashReserves: HIGH value ↔ low stress (inverted)
        # DebtExposure: HIGH value ↔ high stress (direct)
        # Columns ordered: fastest-changing parent last
        # pgmpy column order: last parent varies fastest
        # Parent order: LiquidityRatio, CashReserves, DebtExposure
        fs_values = self._build_financial_stress_cpd()
        cpd_fs = TabularCPD(
            variable="FinancialStress",
            variable_card=3,
            values=fs_values,
            evidence=["LiquidityRatio", "CashReserves", "DebtExposure"],
            evidence_card=[3, 3, 3],
            state_names={
                "FinancialStress": _STATES_LMH,
                "LiquidityRatio": _STATES_LMH,
                "CashReserves": _STATES_LMH,
                "DebtExposure": _STATES_LMH,
            },
        )

        # ---- MarketStress CPD ----------------------------------------------
        # Parents: MarketVolatility(3) x CounterpartyRisk(3) x AnomalyScore(3) = 27
        ms_values = self._build_market_stress_cpd()
        cpd_ms = TabularCPD(
            variable="MarketStress",
            variable_card=3,
            values=ms_values,
            evidence=["MarketVolatility", "CounterpartyRisk", "AnomalyScore"],
            evidence_card=[3, 3, 3],
            state_names={
                "MarketStress": _STATES_LMH,
                "MarketVolatility": _STATES_LMH,
                "CounterpartyRisk": _STATES_LMH,
                "AnomalyScore": _STATES_LMH,
            },
        )

        # ---- RiskLevel CPD -------------------------------------------------
        # Parents: FinancialStress(3) x MarketStress(3) = 9 combos; 4 states output
        rl_values = self._build_risk_level_cpd()
        cpd_rl = TabularCPD(
            variable="RiskLevel",
            variable_card=4,
            values=rl_values,
            evidence=["FinancialStress", "MarketStress"],
            evidence_card=[3, 3],
            state_names={
                "RiskLevel": _STATES_RISK,
                "FinancialStress": _STATES_LMH,
                "MarketStress": _STATES_LMH,
            },
        )

        model.add_cpds(cpd_liq, cpd_cash, cpd_debt, cpd_vol, cpd_cpr, cpd_anom,
                       cpd_fs, cpd_ms, cpd_rl)

        assert model.check_model(), "Bayesian model failed validation!"

        self._model = model
        self._inference = VariableElimination(model)

    # ------------------------------------------------------------------
    # CPD builders
    # ------------------------------------------------------------------
    @staticmethod
    def _build_financial_stress_cpd() -> list:
        """
        Build a 3×27 CPD table for FinancialStress.

        Parent ordering (pgmpy): LiquidityRatio=0, CashReserves=1, DebtExposure=2
        State index: LOW=0, MEDIUM=1, HIGH=2

        Stress semantics:
          LiquidityRatio/CashReserves: HIGH value → LOW stress (inverted)
          DebtExposure: HIGH value → HIGH stress (direct)
        """
        # Stress score = debt_idx - liq_inv_idx - cash_inv_idx
        # We map this to LOW/MEDIUM/HIGH probabilities via softmax-like table

        def _col(liq_idx: int, cash_idx: int, debt_idx: int) -> list:
            # Compute a "stress level" 0-1
            # For liq/cash: HIGH(2)→0, MEDIUM(1)→0.5, LOW(0)→1  (inverted)
            liq_stress = (2 - liq_idx) / 2.0
            cash_stress = (2 - cash_idx) / 2.0
            debt_stress = debt_idx / 2.0
            raw = (0.35 * liq_stress + 0.30 * cash_stress + 0.35 * debt_stress)
            # Map raw (0..1) to distribution over [LOW, MEDIUM, HIGH]
            if raw < 0.25:
                return [0.75, 0.20, 0.05]
            elif raw < 0.45:
                return [0.45, 0.40, 0.15]
            elif raw < 0.65:
                return [0.15, 0.55, 0.30]
            else:
                return [0.05, 0.25, 0.70]

        # pgmpy iterates parents in reverse order (last parent changes fastest)
        # evidence = [LiquidityRatio, CashReserves, DebtExposure]
        cols: list = []
        for liq in range(3):
            for cash in range(3):
                for debt in range(3):
                    cols.append(_col(liq, cash, debt))

        # Transpose: result shape must be (3_states, 27_cols)
        return [list(row) for row in zip(*cols)]

    @staticmethod
    def _build_market_stress_cpd() -> list:
        """
        Build a 3×27 CPD table for MarketStress.

        Parents: MarketVolatility, CounterpartyRisk, AnomalyScore (all direct)
        """

        def _col(vol_idx: int, cpr_idx: int, anom_idx: int) -> list:
            raw = (0.35 * vol_idx + 0.30 * cpr_idx + 0.35 * anom_idx) / 2.0
            if raw < 0.25:
                return [0.75, 0.20, 0.05]
            elif raw < 0.45:
                return [0.40, 0.45, 0.15]
            elif raw < 0.65:
                return [0.12, 0.53, 0.35]
            else:
                return [0.05, 0.20, 0.75]

        cols: list = []
        for vol in range(3):
            for cpr in range(3):
                for anom in range(3):
                    cols.append(_col(vol, cpr, anom))

        return [list(row) for row in zip(*cols)]

    @staticmethod
    def _build_risk_level_cpd() -> list:
        """
        Build a 4×9 CPD table for RiskLevel.

        Parents: FinancialStress(3), MarketStress(3) → 9 combos
        Output states: LOW, MEDIUM, HIGH, CRITICAL
        """
        # fs=0→LOW, fs=1→MED, fs=2→HIGH; ms=0→LOW, ms=1→MED, ms=2→HIGH
        table = {
            # (fs, ms): [LOW, MEDIUM, HIGH, CRITICAL]
            (0, 0): [0.80, 0.15, 0.04, 0.01],
            (0, 1): [0.55, 0.30, 0.12, 0.03],
            (0, 2): [0.20, 0.40, 0.30, 0.10],
            (1, 0): [0.50, 0.32, 0.14, 0.04],
            (1, 1): [0.20, 0.40, 0.30, 0.10],
            (1, 2): [0.05, 0.20, 0.45, 0.30],
            (2, 0): [0.15, 0.35, 0.38, 0.12],
            (2, 1): [0.04, 0.16, 0.48, 0.32],
            (2, 2): [0.01, 0.05, 0.34, 0.60],
        }

        cols: list = []
        for fs in range(3):
            for ms in range(3):
                cols.append(table[(fs, ms)])

        # shape (4, 9)
        return [list(row) for row in zip(*cols)]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def _discretize(self, value: float, thresholds: Tuple[float, float], invert: bool = False) -> str:
        """
        Map a continuous value in [0, 1] to LOW / MEDIUM / HIGH.

        Args:
            value: Float in [0.0, 1.0].
            thresholds: (low_upper, high_lower) boundary pair.
            invert: If True, HIGH value → LOW state (good metric).

        Returns:
            State string: "LOW", "MEDIUM", or "HIGH".
        """
        low_upper, high_lower = thresholds
        if invert:
            # HIGH value is good → inverted mapping
            if value >= high_lower:
                return "LOW"
            elif value >= low_upper:
                return "MEDIUM"
            else:
                return "HIGH"
        else:
            if value <= low_upper:
                return "LOW"
            elif value <= high_lower:
                return "MEDIUM"
            else:
                return "HIGH"

    def infer(self, metrics: Dict[str, float]) -> Dict[str, Any]:
        """
        Run Bayesian inference given a dict of continuous metric values.

        Args:
            metrics: Dict with keys matching node names, values in [0.0, 1.0]:
                     liquidity_ratio, cash_reserves, debt_exposure,
                     market_volatility, counterparty_risk, anomaly_score.

        Returns:
            Dict with:
                ``risk_level``       – str (LOW/MEDIUM/HIGH/CRITICAL)
                ``risk_probability`` – float [0, 1]
                ``state_probabilities`` – dict of all 4 state probabilities
                ``discretized_inputs``  – discretised node evidence
        """
        # Map snake_case metric keys to CamelCase node names
        key_map = {
            "liquidity_ratio":   "LiquidityRatio",
            "cash_reserves":     "CashReserves",
            "debt_exposure":     "DebtExposure",
            "market_volatility": "MarketVolatility",
            "counterparty_risk": "CounterpartyRisk",
            "anomaly_score":     "AnomalyScore",
        }

        # Clamp values
        clamped: Dict[str, float] = {}
        for k, v in metrics.items():
            if k in key_map:
                clamped[k] = float(np.clip(v, 0.0, 1.0))

        # Discretise
        evidence: Dict[str, str] = {}
        for snake, camel in key_map.items():
            val = clamped.get(snake, 0.5)
            thresholds = self._THRESHOLDS[camel]
            invert = camel in self._INVERT_NODES
            evidence[camel] = self._discretize(val, thresholds, invert)

        if self._ready and _PGMPY_AVAILABLE:
            return self._pgmpy_infer(evidence)
        else:
            return self._heuristic_infer(clamped, evidence)

    def _pgmpy_infer(self, evidence: Dict[str, str]) -> Dict[str, Any]:
        """Delegate to VariableElimination."""
        try:
            result = self._inference.query(
                variables=["RiskLevel"],
                evidence=evidence,
                show_progress=False,
            )
            probs = result.values  # shape (4,)
            risk_idx = int(np.argmax(probs))
            risk_level = _STATES_RISK[risk_idx]
            # risk_probability = probability of HIGH or CRITICAL
            risk_prob = float(probs[2] + probs[3])  # HIGH + CRITICAL

            return {
                "risk_level": risk_level,
                "risk_probability": round(risk_prob, 4),
                "state_probabilities": {
                    state: round(float(p), 4)
                    for state, p in zip(_STATES_RISK, probs)
                },
                "discretized_inputs": evidence,
            }
        except Exception as exc:
            logger.error("pgmpy inference error: %s", exc, exc_info=True)
            return self._heuristic_infer({}, evidence)

    @staticmethod
    def _heuristic_infer(
        clamped: Dict[str, float],
        evidence: Dict[str, str],
    ) -> Dict[str, Any]:
        """
        Simple weighted-sum fallback when pgmpy is unavailable or errors.
        """
        state_to_score = {"LOW": 0.0, "MEDIUM": 0.5, "HIGH": 1.0}

        # Weights (bad-direction)
        weights = {
            "LiquidityRatio":   -0.20,   # high liq → lower risk
            "CashReserves":     -0.15,
            "DebtExposure":      0.25,
            "MarketVolatility":  0.20,
            "CounterpartyRisk":  0.15,
            "AnomalyScore":      0.25,
        }

        score = 0.0
        for node, w in weights.items():
            s = state_to_score.get(evidence.get(node, "MEDIUM"), 0.5)
            score += w * s

        # Normalise to [0, 1]
        score = float(np.clip(score + 0.5, 0.0, 1.0))

        if score < 0.25:
            risk_level = "LOW"
            probs = {"LOW": 0.80, "MEDIUM": 0.15, "HIGH": 0.04, "CRITICAL": 0.01}
        elif score < 0.50:
            risk_level = "MEDIUM"
            probs = {"LOW": 0.20, "MEDIUM": 0.55, "HIGH": 0.20, "CRITICAL": 0.05}
        elif score < 0.75:
            risk_level = "HIGH"
            probs = {"LOW": 0.05, "MEDIUM": 0.20, "HIGH": 0.55, "CRITICAL": 0.20}
        else:
            risk_level = "CRITICAL"
            probs = {"LOW": 0.01, "MEDIUM": 0.09, "HIGH": 0.30, "CRITICAL": 0.60}

        risk_prob = probs["HIGH"] + probs["CRITICAL"]
        return {
            "risk_level": risk_level,
            "risk_probability": round(risk_prob, 4),
            "state_probabilities": probs,
            "discretized_inputs": evidence,
        }
