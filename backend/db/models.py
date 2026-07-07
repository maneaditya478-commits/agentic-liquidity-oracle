"""
SQLAlchemy ORM models for the Agentic AI Financial Risk & Liquidity Balancing Oracle.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy import JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.types import BigInteger

@compiles(BigInteger, "sqlite")
def compile_big_int_sqlite(type_, compiler, **kw):
    return "INTEGER"

from db.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# User
# ---------------------------------------------------------------------------
class User(Base):
    """Application user (admin / analyst / viewer)."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="viewer")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )


# ---------------------------------------------------------------------------
# TreasuryMetric
# ---------------------------------------------------------------------------
class TreasuryMetric(Base):
    """Raw treasury snapshot ingested from external feeds or manual entry."""

    __tablename__ = "treasury_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    total_balance: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    liquidity_ratio: Mapped[float] = mapped_column(Float, nullable=False)
    cash_reserves: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    debt_exposure: Mapped[float] = mapped_column(Float, nullable=False)
    market_volatility: Mapped[float] = mapped_column(Float, nullable=False)
    counterparty_risk: Mapped[float] = mapped_column(Float, nullable=False)
    anomaly_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    source: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)

    # Relationships
    predictions: Mapped[list["RiskPrediction"]] = relationship(
        "RiskPrediction", back_populates="metric", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# RiskPrediction
# ---------------------------------------------------------------------------
class RiskPrediction(Base):
    """Bayesian network risk inference result."""

    __tablename__ = "risk_predictions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    metric_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("treasury_metrics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    risk_level: Mapped[str] = mapped_column(String(16), nullable=False)  # LOW/MEDIUM/HIGH/CRITICAL
    risk_probability: Mapped[float] = mapped_column(Float, nullable=False)
    bayesian_inputs: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)
    model_version: Mapped[str] = mapped_column(String(32), nullable=False, default="1.0.0")

    # Relationships
    metric: Mapped["TreasuryMetric"] = relationship("TreasuryMetric", back_populates="predictions")
    simulations: Mapped[list["SimulationResult"]] = relationship(
        "SimulationResult", back_populates="prediction", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# SimulationResult
# ---------------------------------------------------------------------------
class SimulationResult(Base):
    """Monte Carlo simulation output."""

    __tablename__ = "simulation_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    prediction_id: Mapped[int] = mapped_column(
        BigInteger,
        ForeignKey("risk_predictions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    num_simulations: Mapped[int] = mapped_column(Integer, nullable=False)
    horizon_hours: Mapped[int] = mapped_column(Integer, nullable=False)
    expected_loss: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    var_95: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    var_99: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    cvar_95: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    path_distribution: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSON, nullable=True)

    # Relationships
    prediction: Mapped["RiskPrediction"] = relationship(
        "RiskPrediction", back_populates="simulations"
    )
    transactions: Mapped[list["BlockchainTransaction"]] = relationship(
        "BlockchainTransaction", back_populates="simulation", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# BlockchainTransaction
# ---------------------------------------------------------------------------
class BlockchainTransaction(Base):
    """Record of a transaction submitted to the EVM smart contract."""

    __tablename__ = "blockchain_transactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    simulation_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("simulation_results.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    block_number: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    gas_used: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    network: Mapped[str] = mapped_column(String(64), nullable=False, default="localhost")
    oracle_signature: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    simulation: Mapped[Optional["SimulationResult"]] = relationship(
        "SimulationResult", back_populates="transactions"
    )
    audit_records: Mapped[list["AuditRecord"]] = relationship(
        "AuditRecord", back_populates="transaction", cascade="all, delete-orphan"
    )


# ---------------------------------------------------------------------------
# AuditRecord
# ---------------------------------------------------------------------------
class AuditRecord(Base):
    """Immutable audit entry linking risk, simulation, blockchain, and ICP records."""

    __tablename__ = "audit_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, index=True)
    tx_id: Mapped[Optional[int]] = mapped_column(
        BigInteger,
        ForeignKey("blockchain_transactions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, index=True
    )
    risk_score: Mapped[float] = mapped_column(Float, nullable=False)
    var_95: Mapped[float] = mapped_column(Numeric(20, 4), nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    tx_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    icp_record_id: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Relationships
    transaction: Mapped[Optional["BlockchainTransaction"]] = relationship(
        "BlockchainTransaction", back_populates="audit_records"
    )
