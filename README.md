# 🔐 Agentic AI Financial Risk & Liquidity Balancing Oracle

> An autonomous, production-grade treasury protection system combining Bayesian AI, Monte Carlo simulations, Value-at-Risk modeling, and blockchain smart contracts.

---

## 🏗️ System Architecture

```
React Dashboard (Vite + TypeScript + Tailwind)
           │
           ▼  HTTPS + WebSocket
FastAPI Gateway (Python 3.13) ◄──────────── PostgreSQL 16
           │
    ┌──────┴──────┐
    ▼             ▼
AI Agent Core   Web3 Service
(Bayesian +     (web3.py)
 Monte Carlo +        │
 Decision)      ┌─────┴────────────┐
                ▼                  ▼
        TreasuryGuard.sol    AuditLog.mo
        (Solidity / EVM)     (Motoko / ICP)
```

---

## 🚀 Quick Start

### Prerequisites
- Docker Desktop (running)
- Node.js 20+ (for local frontend dev)
- Python 3.13+ (for local backend dev)

### One-Command Startup

```bash
# Clone / navigate to project
cd banking

# Copy environment config
cp .env.example .env

# Start all services
docker-compose up --build
```

| Service | URL |
|---|---|
| 🖥️ Dashboard | http://localhost:5173 |
| 📖 API Docs | http://localhost:8000/docs |
| 🔗 Hardhat RPC | http://localhost:8545 |
| 🐘 PostgreSQL | localhost:5432 |

### Default Login
- **Username**: `admin`
- **Password**: `Admin@Oracle2026`

---

## 📁 Project Structure

```
banking/
├── backend/          # FastAPI + AI Agent Core
│   ├── ai/           # Bayesian Network, Monte Carlo, Decision Engine
│   ├── db/           # PostgreSQL schema and SQLAlchemy models
│   ├── routers/      # FastAPI route handlers
│   ├── services/     # Web3, ICP, WebSocket services
│   └── core/         # Config, security, dependencies
├── contracts/        # Solidity smart contracts (Hardhat)
│   ├── contracts/    # TreasuryGuard.sol
│   ├── scripts/      # Deployment scripts
│   └── test/         # Mocha/Chai test suite
├── motoko/           # ICP audit canister
│   └── src/          # AuditLog.mo
├── frontend/         # React dashboard
│   └── src/
│       ├── components/ # Reusable UI components
│       ├── pages/      # Dashboard pages
│       ├── hooks/      # React hooks
│       ├── store/      # Zustand state
│       └── api/        # Axios API client
├── docker-compose.yml
└── .env.example
```

---

## 🤖 AI Agent Core

### Bayesian Risk Network
Evaluates 6 treasury metrics using a probabilistic graphical model:

| Input | Range | Description |
|---|---|---|
| Liquidity Ratio | 0.0 – 1.0 | Available cash / total obligations |
| Cash Reserves | $M | Absolute cash on hand |
| Debt Exposure | $M | Total outstanding debt |
| Market Volatility | 0.0 – 1.0 | Annualized volatility measure |
| Counterparty Risk | 0.0 – 1.0 | Exposure to counterparty defaults |
| Anomaly Score | 0.0 – 1.0 | ML-derived transaction anomaly indicator |

### Monte Carlo VaR Engine
- **10,000 simulation paths** over a **48-hour horizon**
- Geometric Brownian Motion: `S(t+Δt) = S(t)·exp[(μ-σ²/2)Δt + σ√Δt·Z]`
- Outputs: Expected Loss, VaR(95%), VaR(99%), CVaR(95%)
- Runtime: < 200ms (NumPy vectorized)

### Decision Matrix

| Risk Prob | VaR vs Threshold | Action |
|---|---|---|
| < 60% | Any | None (NORMAL) |
| 60–79% | < threshold | Alert only (WATCH) |
| 60–79% | ≥ threshold | `REBALANCE_TREASURY` |
| ≥ 80% | < threshold | `LOCK_LIQUIDITY` |
| ≥ 80% | ≥ 1.5× threshold | `EMERGENCY_TRANSFER` |
| Recovery | < 45% prob | `UNLOCK_LIQUIDITY` |

---

## 🔗 Smart Contract — TreasuryGuard.sol

- **Network**: Local Hardhat (dev) / Any EVM chain (prod)
- **Access Control**: Oracle Role, Admin Role, Guardian Role (OpenZeppelin)
- **Reentrancy Protection**: OpenZeppelin ReentrancyGuard
- **Upgradability**: UUPS Proxy pattern
- **Multi-sig**: 2-of-3 for emergency transfers

### Contract Functions
```solidity
lockLiquidity(uint256 riskScore, uint256 var95, uint256 confidence, bytes sig)
unlockLiquidity()
rebalanceTreasury(uint256 amount)
emergencyTransfer(address destination, uint256 amount)
updateOracle(address newOracle)
pause() / unpause()
deposit()
```

---

## 📋 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/auth/token` | None | Login, get JWT |
| GET | `/treasury/status` | JWT | Current treasury state |
| POST | `/risk/analyze` | Analyst+ | Run full AI analysis |
| GET | `/risk/history` | JWT | Historical risk data |
| POST | `/decision/execute` | Admin | Trigger blockchain action |
| GET | `/audit/logs` | JWT | Paginated audit trail |
| WS | `/ws/live` | JWT | Real-time event stream |
| GET | `/health` | None | Service health check |

Full interactive docs at: http://localhost:8000/docs

---

## 🔐 Security

- **Authentication**: JWT Bearer tokens (HS256, 15-min expiry)
- **Authorization**: Role-based (ADMIN > ANALYST > VIEWER)
- **Rate Limiting**: 100 req/min per IP
- **Input Validation**: Pydantic schemas on all endpoints
- **Blockchain**: Oracle-signed transaction payloads
- **Audit Trail**: Immutable records on ICP Motoko canister

---

## 🧪 Testing

```bash
# Backend unit tests
cd backend
pip install -r requirements.txt
pytest tests/ -v

# Smart contract tests
cd contracts
npm install
npx hardhat test

# Frontend
cd frontend
npm install
npm run dev
```

---

## 🏭 Production Deployment

1. Replace `.env` with production secrets (never commit `.env`)
2. Set `ORACLE_PRIVATE_KEY` to a dedicated Oracle wallet (not Hardhat test key)
3. Deploy contract to target EVM chain: `npx hardhat run scripts/deploy.js --network <network>`
4. Set `CONTRACT_ADDRESS` in `.env`
5. Install `dfx` and deploy Motoko canister: `dfx deploy --network ic`
6. Set `ICP_CANISTER_ID` and `ICP_STUB_MODE=false` in `.env`
7. Use a managed PostgreSQL instance and update `DATABASE_URL`
8. Run behind a reverse proxy (nginx) with TLS

---

## 📊 Dashboard Pages

| Page | Path | Description |
|---|---|---|
| Treasury Overview | `/` | Metrics, risk gauge, live feed |
| Risk Analytics | `/risk` | Monte Carlo chart, VaR trend, heatmap |
| Blockchain Monitor | `/blockchain` | Contract status, transactions |
| Audit Logs | `/audit` | Immutable decision history |

---

## ⚠️ Security Warnings

> **NEVER** use the Hardhat test private key (`0xac0974...`) on a real network.
> **NEVER** commit the `.env` file to version control.
> **ALWAYS** use a dedicated Oracle wallet with minimal permissions in production.

---

*Built with ❤️ using Python 3.13, FastAPI, pgmpy, NumPy, Solidity 0.8.24, Motoko, React 18, and Recharts.*
