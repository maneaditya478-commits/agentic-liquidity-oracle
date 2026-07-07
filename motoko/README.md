# AuditLog — ICP Motoko Canister

Immutable, upgrade-safe audit-log canister for the **TreasuryGuard Agentic AI Financial Risk & Liquidity Balancing Oracle** system.

Every oracle decision (lock, unlock, rebalance, emergency transfer) is recorded on the **Internet Computer Protocol (ICP)** blockchain via this canister, providing a tamper-evident, decentralised audit trail alongside the EVM on-chain history.

---

## Table of Contents

1. [What the Canister Does](#1-what-the-canister-does)  
2. [Prerequisites](#2-prerequisites)  
3. [Local Deployment (dfx)](#3-local-deployment-dfx)  
4. [ICP Mainnet Deployment](#4-icp-mainnet-deployment)  
5. [AuditRecord Type Schema](#5-auditrecord-type-schema)  
6. [API Reference](#6-api-reference)  
7. [FastAPI Integration (icp_service.py)](#7-fastapi-integration-icp_servicepy)  
8. [Upgrade Safety](#8-upgrade-safety)  

---

## 1. What the Canister Does

`AuditLog.mo` is a **stable Motoko actor** that:

- Accepts `AuditRecord` structs from the FastAPI backend (`icp_service.py`) and appends them to an immutable, on-chain list.
- Assigns each record a sequential auto-increment `id` and records the ICP block timestamp (nanoseconds).
- Exposes **query** methods (fast, free, no consensus) to read records by id, paginate recent records, or fetch the full history.
- Restricts destructive operations (`clearAll`) to the **owner principal** (the deployer).
- Survives canister **upgrades** without data loss thanks to `stable var` storage and `preupgrade`/`postupgrade` hooks.

---

## 2. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| DFX SDK | ≥ 0.20.0 | `sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"` |
| Node.js | ≥ 18 | https://nodejs.org |
| Motoko compiler | bundled with dfx | — |

---

## 3. Local Deployment (dfx)

```bash
# 1. Navigate to the motoko directory
cd d:/Project/banking/motoko

# 2. Start a local ICP replica
dfx start --background --clean

# 3. Deploy the canister
dfx deploy AuditLog

# 4. Note the canister id printed by dfx, e.g.:
#    AuditLog: r7inp-6aaaa-aaaaa-aaabq-cai

# 5. Verify deployment — fetch record count (should be 0)
dfx canister call AuditLog getRecordCount

# 6. Add a test record
dfx canister call AuditLog addRecord '(
  record {
    id         = 0;
    timestamp  = 0;
    riskScore  = 0.82 : float64;
    var95      = 125000.0 : float64;
    confidence = 0.91 : float64;
    action     = "LOCK_LIQUIDITY";
    txHash     = "0xabcdef1234567890";
    oracleSig  = "0xsignature";
    network    = "hardhat";
  }
)'

# 7. Retrieve all records
dfx canister call AuditLog getRecords

# 8. Stop the local replica when done
dfx stop
```

---

## 4. ICP Mainnet Deployment

> [!IMPORTANT]  
> You need ICP cycles to deploy. Acquire cycles via the NNS dapp or `dfx cycles`.

```bash
# 1. Ensure you have a funded identity
dfx identity use <your-identity>
dfx wallet balance --network ic

# 2. Deploy to mainnet
dfx deploy --network ic AuditLog

# The deployed canister id will be printed. Save it — you need it in .env:
# ICP_CANISTER_ID=<canister-id>

# 3. Verify on-chain
dfx canister --network ic call AuditLog getRecordCount

# 4. Check Candid UI
# https://a4gq6-oaaaa-aaaab-qaa4q-cai.raw.ic0.app/?id=<canister-id>
```

### Cycles estimate

| Operation | Approx. cycles |
|-----------|---------------|
| Deploy    | ~2 T (2 trillion) |
| addRecord | ~100 K per call |
| Query     | 0 (free) |

---

## 5. AuditRecord Type Schema

```
AuditRecord {
  id         : Nat    // Auto-assigned by canister (0-based, sequential)
  timestamp  : Int    // ICP nanosecond epoch timestamp (Time.now())
  riskScore  : Float  // AI composite risk score, 0.0 – 1.0
  var95      : Float  // 95% Value-at-Risk in USD
  confidence : Float  // Model confidence, 0.0 – 1.0
  action     : Text   // One of: LOCK_LIQUIDITY | UNLOCK_LIQUIDITY |
                      //         REBALANCE_TREASURY | EMERGENCY_TRANSFER
  txHash     : Text   // 0x-prefixed EVM transaction hash (66 chars)
  oracleSig  : Text   // Hex-encoded ECDSA oracle signature
  network    : Text   // EVM chain name: "hardhat" | "localhost" | "mainnet"
}
```

### Field notes

| Field | Range / Format | Notes |
|-------|---------------|-------|
| `id` | 0, 1, 2, … | Assigned by canister; caller's value is ignored |
| `timestamp` | Unix nanoseconds | Set to `Time.now()` at write time |
| `riskScore` | 0.0 – 1.0 | Normalised from Solidity scaled integer |
| `var95` | USD float | Can be very large for institutional portfolios |
| `confidence` | 0.0 – 1.0 | Normalised from Solidity scaled integer |
| `action` | enum-like Text | Should match the Solidity `action` strings |
| `txHash` | `0x` + 64 hex chars | EVM `TransactionResponse.hash` |
| `oracleSig` | hex string | Raw `bytes` signature from Solidity call |
| `network` | free text | Match Hardhat network name |

---

## 6. API Reference

### Update Methods (require consensus, cost cycles)

#### `addRecord(r: AuditRecord) → async Nat`

Appends a record to stable storage.  
- `r.id` and `r.timestamp` fields are **overwritten** by the canister.  
- Returns the assigned `id`.

```bash
dfx canister call AuditLog addRecord '(record { ... })'
```

---

#### `clearAll() → async ()`

Deletes all records and resets `nextId` to 0.  
**Restricted to owner principal.** Panics (asserts) for any other caller.

```bash
dfx canister call AuditLog clearAll
```

> [!CAUTION]  
> Irreversible. Only use in development/disaster recovery.

---

### Query Methods (instant, free, no consensus)

#### `getRecords() → query async [AuditRecord]`

Returns the complete record array in insertion order.

```bash
dfx canister call AuditLog getRecords
```

---

#### `getRecord(id: Nat) → query async ?AuditRecord`

Returns `opt record { … }` for a given id, or `null` if not found.

```bash
dfx canister call AuditLog getRecord '(0)'
```

---

#### `getRecordCount() → query async Nat`

Returns total number of stored records.

```bash
dfx canister call AuditLog getRecordCount
```

---

#### `getRecentRecords(n: Nat) → query async [AuditRecord]`

Returns the last `n` records (oldest-first within slice).  
If `n ≥ total`, all records are returned.

```bash
dfx canister call AuditLog getRecentRecords '(10)'
```

---

#### `getOwner() → query async ?Principal`

Returns the owner principal (set on first `addRecord` call).

```bash
dfx canister call AuditLog getOwner
```

---

#### `getNextId() → query async Nat`

Returns the id that will be assigned to the **next** record.

```bash
dfx canister call AuditLog getNextId
```

---

## 7. FastAPI Integration (icp_service.py)

The backend `icp_service.py` communicates with this canister via the **ICP HTTP agent** (Python `ic-py` library).

### Environment variables required

```env
ICP_CANISTER_ID=<your-canister-id>        # e.g. r7inp-6aaaa-aaaaa-aaabq-cai
ICP_NETWORK=local                          # or "ic" for mainnet
ICP_IDENTITY_PEM=/path/to/identity.pem    # Ed25519 PEM for signing
```

### Typical call pattern

```python
# icp_service.py (excerpt)
from ic.client import Client
from ic.identity import Identity
from ic.agent import Agent
from ic.candid import encode, decode

client   = Client(url="http://127.0.0.1:4943")   # local replica
identity = Identity()                              # anonymous for queries
agent    = Agent(identity, client)

canister_id = os.environ["ICP_CANISTER_ID"]

# --- Write: addRecord (update call) ---
record_args = encode([{
    "type": "record",
    "value": {
        "id":         {"type": "nat",   "value": 0},
        "timestamp":  {"type": "int",   "value": 0},
        "riskScore":  {"type": "float64","value": risk_score},
        "var95":      {"type": "float64","value": var95},
        "confidence": {"type": "float64","value": confidence},
        "action":     {"type": "text",  "value": action},
        "txHash":     {"type": "text",  "value": tx_hash},
        "oracleSig":  {"type": "text",  "value": oracle_sig},
        "network":    {"type": "text",  "value": network},
    }
}])
result = await agent.update_raw(canister_id, "addRecord", record_args)
assigned_id = decode(result)[0]["value"]

# --- Read: getRecentRecords (query call, free) ---
args   = encode([{"type": "nat", "value": 20}])
result = await agent.query_raw(canister_id, "getRecentRecords", args)
recent = decode(result)[0]["value"]
```

### Data flow

```
FastAPI backend
  └─ icp_service.py
       ├─ Oracle decision received from AI model
       ├─ Calls TreasuryGuard.sol on EVM (via web3/ethers)
       ├─ On tx confirmation → extracts txHash + oracleSig
       └─ Calls AuditLog.addRecord() on ICP
            └─ Record stored in stable var (survives upgrades)
```

---

## 8. Upgrade Safety

All records are stored in `stable var records : [AuditRecord]` and `stable var nextId : Nat`.

- **`preupgrade`**: no-op (stable vars are serialised automatically by the Motoko runtime).
- **`postupgrade`**: reserved for future schema migrations.

To upgrade the canister without data loss:

```bash
# Edit AuditLog.mo, then:
dfx deploy AuditLog          # local
dfx deploy --network ic AuditLog  # mainnet

# Verify data persisted
dfx canister call AuditLog getRecordCount
```

> [!NOTE]  
> Adding **new fields** to `AuditRecord` in a future upgrade requires a migration step in `postupgrade` because the serialised stable memory will contain records without the new field.

---

*Generated for TreasuryGuard v1.0.0 — 2026*
