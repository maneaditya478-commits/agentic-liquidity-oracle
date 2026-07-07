"""
Core configuration module using pydantic-settings.
Loads all environment variables from .env file.
"""
from __future__ import annotations

from typing import List
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables / .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------ #
    # Database
    # ------------------------------------------------------------------ #
    DATABASE_URL: str = (
        "postgresql://postgres:postgres@localhost:5432/banking_oracle"
    )

    # ------------------------------------------------------------------ #
    # JWT / Auth
    # ------------------------------------------------------------------ #
    JWT_SECRET_KEY: str = "change-me-in-production-super-secret-key-32chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ------------------------------------------------------------------ #
    # Admin seed credentials
    # ------------------------------------------------------------------ #
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "Admin@123456"
    ADMIN_EMAIL: str = "admin@treasury.local"

    # ------------------------------------------------------------------ #
    # Blockchain / EVM
    # ------------------------------------------------------------------ #
    ORACLE_PRIVATE_KEY: str = (
        "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    )
    EVM_RPC_URL: str = "http://127.0.0.1:8545"
    CONTRACT_ADDRESS: str = "0x0000000000000000000000000000000000000000"

    @field_validator("CONTRACT_ADDRESS", mode="before")
    @classmethod
    def load_contract_address(cls, v: object) -> str:
        """Load contract address from file if it is the default zero address."""
        import os
        addr = str(v)
        if addr == "0x0000000000000000000000000000000000000000" or not addr:
            if os.path.exists(".contract_address"):
                try:
                    with open(".contract_address", "r", encoding="utf-8") as f:
                        file_addr = f.read().strip()
                        if file_addr.startswith("0x") and len(file_addr) == 42:
                            return file_addr
                except Exception:
                    pass
        return addr

    # ------------------------------------------------------------------ #
    # ICP / Motoko canister
    # ------------------------------------------------------------------ #
    ICP_CANISTER_ID: str = "rrkah-fqaaa-aaaaa-aaaaq-cai"
    ICP_HOST: str = "https://ic0.app"
    ICP_STUB_MODE: bool = True

    # ------------------------------------------------------------------ #
    # Agent / Simulation parameters
    # ------------------------------------------------------------------ #
    AGENT_POLL_INTERVAL_SECONDS: int = 30
    VAR_THRESHOLD_USD: float = 500_000.0
    RISK_PROBABILITY_THRESHOLD: float = 0.60
    RECOVERY_THRESHOLD: float = 0.30
    MAX_SIMULATIONS: int = 10_000
    SIMULATION_HORIZON_HOURS: int = 48

    # ------------------------------------------------------------------ #
    # CORS
    # ------------------------------------------------------------------ #
    ALLOWED_ORIGINS: str = (
        "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
    )

    # ------------------------------------------------------------------ #
    # Rate limiting
    # ------------------------------------------------------------------ #
    RATE_LIMIT_PER_MINUTE: int = 60


# ---------------------------------------------------------------------------
# Global singleton – import this everywhere
# ---------------------------------------------------------------------------
settings = Settings()
