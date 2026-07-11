# 🚀 Serverless & Public Cloud Deployment Guide

This guide details how to deploy the **Agentic AI Financial Risk & Liquidity Balancing Oracle** stack to serverless and hosted cloud platforms.

```mermaid
graph TD
    A[React Frontend] -->|Deploys to| B(Vercel)
    C[FastAPI Backend] -->|Deploys to| D(Render / Railway)
    E[PostgreSQL] -->|Spins up on| F(Neon / Supabase)
    G[Solidity Contract] -->|Deploys to| H(Ethereum Sepolia Testnet)
    
    B -->|REST / WebSockets| D
    D -->|Queries / Writes| F
    D -->|Web3 RPC| H
```

---

## 📅 Part 1: Serverless PostgreSQL Setup (Neon / Supabase)

We need a persistent, hosted PostgreSQL database for our backend.

1. **Create Database**:
   * Go to **[Neon.tech](https://neon.tech/)** (or Supabase) and sign up for a free account.
   * Create a new project named `treasury-oracle`.
   * Keep the database engine set to **PostgreSQL 16**.
2. **Retrieve Connection URI**:
   * Under the Neon dashboard, copy the **Connection String**.
   * Format: `postgresql://<user>:<password>@<host>/neondb?sslmode=require`
   * Keep this safe; we will configure it as `DATABASE_URL` in the backend environment.

---

## 🔗 Part 2: Smart Contract Deployment (Ethereum Sepolia Testnet)

We will deploy our Solidity contract to the public Ethereum Sepolia testnet.

### 1. Prerequisites
* **Sepolia Account**: You need a Metamask or Web3 wallet. Retrieve your private key.
* **Test ETH**: Get free Sepolia test ETH from a faucet (e.g., [sepoliafaucet.com](https://sepoliafaucet.com/) or [infura.io/faucet/sepolia](https://www.infura.io/faucet/sepolia)).
* **RPC URL**: Get a free Sepolia RPC URL endpoint from **[Alchemy](https://www.alchemy.com/)** or **[Infura](https://www.infura.io/)**.

### 2. Configure Environment Variables
Inside the [contracts](file:///d:/Project/banking/contracts) folder on your local machine, create a `.env` file:
```env
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
DEPLOYER_PRIVATE_KEY=your_deployer_wallet_private_key
ORACLE_ADDRESS=your_oracle_agent_wallet_address
```

### 3. Deploy
Run the Hardhat deploy command from the `contracts` directory:
```bash
cd contracts
npx hardhat run scripts/deploy.js --network sepolia
```
* Note down the outputted contract address (e.g., `0x...`).
* This address will be configured as `CONTRACT_ADDRESS` on your FastAPI backend.

---

## 🐍 Part 3: Python Backend Gateway Deployment (Render / Railway)

We will deploy the FastAPI backend server to **Render** or **Railway**.

### 1. Build Command & Configuration
* **Service Type**: Web Service
* **Runtime**: Python 3 (select Python 3.10+)
* **Root Directory**: `backend` (or leave empty and set Build Command relative to it)
* **Build Command**: `pip install -r requirements.txt`
* **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 2. Environment Variables
Add the following key-value pairs in the Render/Railway **Environment Variables** dashboard:

| Variable Name | Example Value | Description |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | `postgresql://oracle:pass@ep-host.neon.tech/neondb?sslmode=require` | Connection URI from Part 1 |
| **`EVM_RPC_URL`** | `https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY` | Sepolia RPC URL from Part 2 |
| **`CONTRACT_ADDRESS`** | `0xYourDeployedSepoliaContractAddress` | Deployed contract address from Part 2 |
| **`ORACLE_PRIVATE_KEY`** | `your_oracle_agent_wallet_private_key` | Private key the agent uses to sign transactions |
| **`JWT_SECRET_KEY`** | `generate-a-long-random-secret-key-32chars` | Token encryption secret key |
| **`ADMIN_PASSWORD`** | `YourSecureAdminPassword2026` | Admin account password |
| **`ALLOWED_ORIGINS`** | `https://your-frontend.vercel.app` | Your Vercel frontend domain (from Part 4) |

* Once deployment finishes, Render/Railway will provide a public URL for your API (e.g., `https://treasury-backend.onrender.com`).

---

## ⚡ Part 4: React Dashboard Frontend Deployment (Vercel)

We will deploy the React Vite frontend dashboard to **Vercel**.

1. **Link Repository**:
   * Go to **[Vercel.com](https://vercel.com/)** and import your GitHub repository: `agentic-liquidity-oracle`.
2. **Build Settings**:
   * **Root Directory**: `frontend`
   * **Framework Preset**: `Vite`
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
3. **Environment Variables**:
   Add the following variables to connect to your hosted API:
   * **`VITE_API_URL`**: `https://treasury-backend.onrender.com` (HTTPS URL of your Render API)
   * **`VITE_WS_URL`**: `wss://treasury-backend.onrender.com` (WSS WebSocket URL of your Render API)
4. **Deploy**:
   * Click **Deploy**. Vercel will build and serve your React app at a public domain (e.g., `https://agentic-liquidity-oracle.vercel.app`).
5. **Update Backend CORS**:
   * Copy your Vercel deployment URL.
   * Go back to the Render/Railway backend environment settings, and add this URL to **`ALLOWED_ORIGINS`** to allow the frontend to access the API.
