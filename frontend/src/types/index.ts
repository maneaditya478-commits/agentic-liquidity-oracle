// ─── Treasury Oracle – TypeScript Interfaces ───────────────────────────────

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type ActionType =
  | 'LOCK_LIQUIDITY'
  | 'UNLOCK_LIQUIDITY'
  | 'REBALANCE_TREASURY'
  | 'EMERGENCY_TRANSFER'

export interface TreasuryMetric {
  id: string
  timestamp: string
  total_balance: number
  liquidity_ratio: number
  cash_reserves: number
  debt_exposure: number
  market_volatility: number
  counterparty_risk: number
  anomaly_score: number
  source: string
}

export interface RiskPrediction {
  id: string
  metric_id: string
  timestamp: string
  risk_level: RiskLevel
  risk_probability: number
  bayesian_inputs: Record<string, number>
  model_version: string
}

export interface SimulationResult {
  id: string
  prediction_id: string
  timestamp: string
  num_simulations: number
  horizon_hours: number
  expected_loss: number
  var_95: number
  var_99: number
  cvar_95: number
  path_distribution: Array<{ bin: number; count: number }>
}

export interface BlockchainTransaction {
  id: string
  simulation_id: string
  timestamp: string
  action: ActionType
  tx_hash: string
  block_number: number
  gas_used: number
  status: 'PENDING' | 'SUCCESS' | 'FAILED'
  network: string
  oracle_signature: string
}

export interface AuditRecord {
  id: string
  tx_id: string
  timestamp: string
  risk_score: number
  var_95: number
  confidence: number
  action: ActionType
  tx_hash: string
  icp_record_id: string
  summary: string
}

export interface TreasuryStatus {
  metric: TreasuryMetric
  risk_level: RiskLevel
  risk_probability: number
  is_locked: boolean
  var_95: number
}

export interface AnalyzeRequest {
  liquidity_ratio: number
  cash_reserves: number
  debt_exposure: number
  market_volatility: number
  counterparty_risk: number
  anomaly_score: number
}

export interface AnalyzeResponse {
  metric_id: string
  prediction_id: string
  simulation_id: string
  risk_level: RiskLevel
  risk_probability: number
  expected_loss: number
  var_95: number
  var_99: number
  cvar_95: number
  action_triggered: boolean
  tx_hash: string | null
  processing_time_ms: number
}

export interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'analyst' | 'viewer'
}

export interface AuthTokens {
  access_token: string
  token_type: string
  role: string
}

export interface WebSocketMessage {
  type: 'RISK_UPDATE' | 'ACTION_TRIGGERED' | 'TX_CONFIRMED' | 'AGENT_CYCLE'
  payload: Record<string, unknown>
}

export interface VaRDataPoint {
  timestamp: string
  var_95: number
  var_99: number
  risk_probability: number
}

export interface HeatmapCell {
  day: number
  hour: number
  value: number
}
