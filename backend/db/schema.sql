-- =============================================================================
-- Agentic AI Financial Risk & Liquidity Balancing Oracle
-- Raw DDL Schema
-- =============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- FUNCTION: auto-update updated_at column
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TABLE: users
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id               BIGSERIAL    PRIMARY KEY,
    username         VARCHAR(64)  NOT NULL UNIQUE,
    email            VARCHAR(255) NOT NULL UNIQUE,
    hashed_password  VARCHAR(255) NOT NULL,
    role             VARCHAR(32)  NOT NULL DEFAULT 'viewer',
    is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username  ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role      ON users(role);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- TABLE: treasury_metrics
-- =============================================================================
CREATE TABLE IF NOT EXISTS treasury_metrics (
    id                 BIGSERIAL      PRIMARY KEY,
    timestamp          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    total_balance      NUMERIC(20,4)  NOT NULL,
    liquidity_ratio    NUMERIC(8,6)   NOT NULL CHECK (liquidity_ratio >= 0),
    cash_reserves      NUMERIC(20,4)  NOT NULL,
    debt_exposure      NUMERIC(8,6)   NOT NULL CHECK (debt_exposure >= 0),
    market_volatility  NUMERIC(8,6)   NOT NULL CHECK (market_volatility >= 0),
    counterparty_risk  NUMERIC(8,6)   NOT NULL CHECK (counterparty_risk >= 0),
    anomaly_score      NUMERIC(8,6)   NOT NULL DEFAULT 0.0,
    source             VARCHAR(128),
    updated_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tm_timestamp ON treasury_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_tm_source    ON treasury_metrics(source);

CREATE TRIGGER trg_treasury_metrics_updated_at
    BEFORE UPDATE ON treasury_metrics
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- TABLE: risk_predictions
-- =============================================================================
CREATE TABLE IF NOT EXISTS risk_predictions (
    id               BIGSERIAL    PRIMARY KEY,
    metric_id        BIGINT       NOT NULL REFERENCES treasury_metrics(id) ON DELETE CASCADE,
    timestamp        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    risk_level       VARCHAR(16)  NOT NULL CHECK (risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    risk_probability NUMERIC(6,4) NOT NULL CHECK (risk_probability BETWEEN 0 AND 1),
    bayesian_inputs  JSONB,
    model_version    VARCHAR(32)  NOT NULL DEFAULT '1.0.0',
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rp_metric_id  ON risk_predictions(metric_id);
CREATE INDEX IF NOT EXISTS idx_rp_timestamp  ON risk_predictions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_rp_risk_level ON risk_predictions(risk_level);

CREATE TRIGGER trg_risk_predictions_updated_at
    BEFORE UPDATE ON risk_predictions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- TABLE: simulation_results
-- =============================================================================
CREATE TABLE IF NOT EXISTS simulation_results (
    id                BIGSERIAL     PRIMARY KEY,
    prediction_id     BIGINT        NOT NULL REFERENCES risk_predictions(id) ON DELETE CASCADE,
    timestamp         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    num_simulations   INTEGER       NOT NULL,
    horizon_hours     INTEGER       NOT NULL,
    expected_loss     NUMERIC(20,4) NOT NULL,
    var_95            NUMERIC(20,4) NOT NULL,
    var_99            NUMERIC(20,4) NOT NULL,
    cvar_95           NUMERIC(20,4) NOT NULL,
    path_distribution JSONB,
    updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_prediction_id ON simulation_results(prediction_id);
CREATE INDEX IF NOT EXISTS idx_sr_timestamp     ON simulation_results(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sr_var_95        ON simulation_results(var_95 DESC);

CREATE TRIGGER trg_simulation_results_updated_at
    BEFORE UPDATE ON simulation_results
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- TABLE: blockchain_transactions
-- =============================================================================
CREATE TABLE IF NOT EXISTS blockchain_transactions (
    id               BIGSERIAL    PRIMARY KEY,
    simulation_id    BIGINT       REFERENCES simulation_results(id) ON DELETE SET NULL,
    timestamp        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    action           VARCHAR(64)  NOT NULL,
    tx_hash          VARCHAR(128) UNIQUE,
    block_number     BIGINT,
    gas_used         BIGINT,
    status           VARCHAR(32)  NOT NULL DEFAULT 'pending',
    network          VARCHAR(64)  NOT NULL DEFAULT 'localhost',
    oracle_signature TEXT,
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bt_simulation_id ON blockchain_transactions(simulation_id);
CREATE INDEX IF NOT EXISTS idx_bt_timestamp     ON blockchain_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_bt_tx_hash       ON blockchain_transactions(tx_hash);
CREATE INDEX IF NOT EXISTS idx_bt_status        ON blockchain_transactions(status);

CREATE TRIGGER trg_blockchain_transactions_updated_at
    BEFORE UPDATE ON blockchain_transactions
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- TABLE: audit_records
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_records (
    id            BIGSERIAL     PRIMARY KEY,
    tx_id         BIGINT        REFERENCES blockchain_transactions(id) ON DELETE SET NULL,
    timestamp     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    risk_score    NUMERIC(6,4)  NOT NULL,
    var_95        NUMERIC(20,4) NOT NULL,
    confidence    NUMERIC(6,4)  NOT NULL,
    action        VARCHAR(64)   NOT NULL,
    tx_hash       VARCHAR(128),
    icp_record_id BIGINT,
    summary       TEXT,
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_tx_id         ON audit_records(tx_id);
CREATE INDEX IF NOT EXISTS idx_ar_timestamp     ON audit_records(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ar_icp_record_id ON audit_records(icp_record_id);

CREATE TRIGGER trg_audit_records_updated_at
    BEFORE UPDATE ON audit_records
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- =============================================================================
-- SEED: Admin user (password = Admin@123456 bcrypt hash)
-- Change the hash if you change the default password
-- =============================================================================
INSERT INTO users (username, email, hashed_password, role, is_active)
VALUES (
    'admin',
    'admin@treasury.local',
    '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',  -- Admin@123456
    'admin',
    TRUE
)
ON CONFLICT (username) DO NOTHING;
