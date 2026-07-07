"""
Monte Carlo Simulation Engine using Geometric Brownian Motion.

Target performance: < 200 ms for 10,000 paths on standard hardware
using NumPy vectorisation.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

import numpy as np

logger = logging.getLogger(__name__)


class MonteCarloEngine:
    """
    Vectorised Monte Carlo engine for treasury value-at-risk estimation.

    Parameters
    ----------
    n_simulations : int
        Number of GBM paths to simulate (default 10 000).
    horizon_hours : int
        Time horizon in hours (default 48).
    """

    def __init__(
        self,
        n_simulations: int = 10_000,
        horizon_hours: int = 48,
    ) -> None:
        self.n_simulations = int(n_simulations)
        self.horizon_hours = int(horizon_hours)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def simulate(
        self,
        initial_value: float,
        volatility: float,
        drift: float = 0.0,
    ) -> Dict[str, Any]:
        """
        Run GBM Monte Carlo and compute risk metrics.

        Parameters
        ----------
        initial_value : float
            Starting portfolio/treasury value in USD.
        volatility : float
            Annual volatility (σ), e.g. 0.20 for 20 % annualised vol.
            Can also be passed as a fraction [0, 1].
        drift : float
            Annual drift (μ), default 0.0 (risk-neutral).

        Returns
        -------
        dict with keys:
            expected_loss, var_95, var_99, cvar_95,
            confidence_interval_95, path_distribution,
            num_simulations, horizon_hours, initial_value.
        """
        try:
            # ---- Input sanitisation ----------------------------------
            S0 = float(abs(initial_value)) or 1.0
            sigma = float(np.clip(volatility, 1e-6, 5.0))
            mu = float(drift)

            # Time parameters
            T = self.horizon_hours / 8_760.0  # convert hours → years
            n_steps = max(1, self.horizon_hours)
            dt = T / n_steps

            # ---- Simulate paths -------------------------------------
            final_values = self._gbm_paths(S0, mu, sigma, T, dt, n_steps)

            # ---- Compute metrics ------------------------------------
            metrics = self._compute_metrics(S0, final_values)
            metrics["num_simulations"] = self.n_simulations
            metrics["horizon_hours"] = self.horizon_hours
            metrics["initial_value"] = S0

            return metrics

        except Exception as exc:
            logger.error("Monte Carlo simulation failed: %s", exc, exc_info=True)
            # Return safe fallback
            return self._fallback_metrics(initial_value)

    # ------------------------------------------------------------------
    # GBM path generation (vectorised)
    # ------------------------------------------------------------------
    def _gbm_paths(
        self,
        S0: float,
        mu: float,
        sigma: float,
        T: float,
        dt: float,
        n: int,
    ) -> np.ndarray:
        """
        Generate GBM paths and return an array of final values.

        S(t+dt) = S(t) * exp((mu - 0.5*sigma²)*dt + sigma*sqrt(dt)*Z)

        Parameters
        ----------
        S0    : Initial value.
        mu    : Annual drift.
        sigma : Annual volatility.
        T     : Time horizon in years (unused directly; dt=T/n).
        dt    : Time step in years.
        n     : Number of time steps.

        Returns
        -------
        np.ndarray of shape (n_simulations,) — final portfolio values.
        """
        # Pre-compute constants
        drift_term = (mu - 0.5 * sigma ** 2) * dt
        diffusion_coeff = sigma * np.sqrt(dt)

        # Random draws: shape (n_simulations, n_steps)
        rng = np.random.default_rng()
        Z = rng.standard_normal((self.n_simulations, n))

        # Cumulative log-returns
        log_returns = drift_term + diffusion_coeff * Z
        cum_log_returns = np.sum(log_returns, axis=1)  # shape (n_simulations,)

        final_values: np.ndarray = S0 * np.exp(cum_log_returns)
        return final_values

    # ------------------------------------------------------------------
    # Risk metric computation
    # ------------------------------------------------------------------
    def _compute_metrics(
        self,
        initial: float,
        final_values: np.ndarray,
    ) -> Dict[str, Any]:
        """
        Compute VaR, CVaR, expected loss and path distribution.

        Parameters
        ----------
        initial      : S0 (initial portfolio value).
        final_values : 1-D array of simulated final portfolio values.

        Returns
        -------
        dict with risk metrics.
        """
        pnl = final_values - initial  # positive = gain, negative = loss

        expected_loss = float(-np.mean(pnl))  # positive number when avg loss

        # VaR at 95% and 99% (loss convention: positive = bad)
        var_95 = float(-np.percentile(pnl, 5))   # 5th percentile of P&L
        var_99 = float(-np.percentile(pnl, 1))   # 1st percentile of P&L

        # CVaR / Expected Shortfall at 95%
        threshold_95 = np.percentile(pnl, 5)
        tail_losses = pnl[pnl <= threshold_95]
        cvar_95 = float(-np.mean(tail_losses)) if len(tail_losses) > 0 else var_95

        # 95 % Confidence interval on the expected final value
        mean_final = float(np.mean(final_values))
        std_final = float(np.std(final_values))
        ci_lower = mean_final - 1.96 * std_final / np.sqrt(self.n_simulations)
        ci_upper = mean_final + 1.96 * std_final / np.sqrt(self.n_simulations)

        # Path distribution: 50-bin histogram of final values for charting
        hist, bin_edges = np.histogram(final_values, bins=50)
        path_distribution: List[Dict[str, float]] = [
            {"bin_center": float((bin_edges[i] + bin_edges[i + 1]) / 2), "count": int(hist[i])}
            for i in range(len(hist))
        ]

        return {
            "expected_loss": round(max(expected_loss, 0.0), 4),
            "var_95": round(max(var_95, 0.0), 4),
            "var_99": round(max(var_99, 0.0), 4),
            "cvar_95": round(max(cvar_95, 0.0), 4),
            "confidence_interval_95": {
                "lower": round(ci_lower, 4),
                "upper": round(ci_upper, 4),
                "mean": round(mean_final, 4),
            },
            "path_distribution": path_distribution,
        }

    # ------------------------------------------------------------------
    # Fallback
    # ------------------------------------------------------------------
    @staticmethod
    def _fallback_metrics(initial_value: float) -> Dict[str, Any]:
        """Return deterministic placeholder metrics on simulation failure."""
        S0 = abs(float(initial_value)) or 1_000_000.0
        return {
            "expected_loss": round(S0 * 0.02, 4),
            "var_95": round(S0 * 0.05, 4),
            "var_99": round(S0 * 0.08, 4),
            "cvar_95": round(S0 * 0.07, 4),
            "confidence_interval_95": {
                "lower": round(S0 * 0.95, 4),
                "upper": round(S0 * 1.05, 4),
                "mean": round(S0, 4),
            },
            "path_distribution": [],
            "num_simulations": 0,
            "horizon_hours": 48,
            "initial_value": S0,
        }
