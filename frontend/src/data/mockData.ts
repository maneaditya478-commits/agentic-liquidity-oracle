import { subHours, subMinutes, format } from 'date-fns'
import type {
  TreasuryStatus,
  RiskPrediction,
  SimulationResult,
  BlockchainTransaction,
  AuditRecord,
  VaRDataPoint,
} from '../types'

const now = new Date()

// ─── Treasury Status ────────────────────────────────────────────────────────
export const mockTreasuryStatus: TreasuryStatus = {
  metric: {
    id: 'metric-001',
    timestamp: now.toISOString(),
    total_balance: 48_750_000,
    liquidity_ratio: 0.74,
    cash_reserves: 12_300_000,
    debt_exposure: 8_900_000,
    market_volatility: 0.38,
    counterparty_risk: 0.22,
    anomaly_score: 0.15,
    source: 'oracle-v2',
  },
  risk_level: 'MEDIUM',
  risk_probability: 0.47,
  is_locked: false,
  var_95: 1_840_000,
}

// ─── Risk History ───────────────────────────────────────────────────────────
export const mockRiskHistory: RiskPrediction[] = Array.from(
  { length: 48 },
  (_, i) => ({
    id: `risk-${i}`,
    metric_id: `metric-${i}`,
    timestamp: subMinutes(now, i * 30).toISOString(),
    risk_level: i < 4 ? 'HIGH' : i < 10 ? 'MEDIUM' : 'LOW',
    risk_probability: Math.max(0.1, 0.65 - i * 0.01 + Math.sin(i * 0.5) * 0.1),
    bayesian_inputs: {
      liquidity_weight: 0.3,
      volatility_weight: 0.4,
      counterparty_weight: 0.3,
    },
    model_version: 'v2.3.1',
  })
)

// ─── Monte Carlo Distribution ───────────────────────────────────────────────
export const mockMonteCarloDistribution = Array.from({ length: 60 }, (_, i) => {
  const bin = i * 1000
  const peak = 25
  const sigma = 12
  const count = Math.round(
    10000 * Math.exp(-0.5 * Math.pow((i - peak) / sigma, 2)) + Math.random() * 200
  )
  return { bin, count: Math.max(0, count) }
})

// ─── Simulation Result ──────────────────────────────────────────────────────
export const mockSimulation: SimulationResult = {
  id: 'sim-001',
  prediction_id: 'risk-0',
  timestamp: now.toISOString(),
  num_simulations: 10000,
  horizon_hours: 24,
  expected_loss: 920_000,
  var_95: 1_840_000,
  var_99: 2_650_000,
  cvar_95: 2_100_000,
  path_distribution: mockMonteCarloDistribution,
}

// ─── Blockchain Transactions ─────────────────────────────────────────────────
export const mockTransactions: BlockchainTransaction[] = [
  {
    id: 'tx-001',
    simulation_id: 'sim-001',
    timestamp: subMinutes(now, 8).toISOString(),
    action: 'REBALANCE_TREASURY',
    tx_hash: '0x4a8f2e9d1c3b7f6e5a4d8c2b9e7f1a3d5c8b2e4f6a8c0d2e4f6a8c0d2e4f6a8',
    block_number: 19_284_712,
    gas_used: 142_500,
    status: 'SUCCESS',
    network: 'ethereum',
    oracle_signature: '0xabcdef1234567890',
  },
  {
    id: 'tx-002',
    simulation_id: 'sim-001',
    timestamp: subMinutes(now, 45).toISOString(),
    action: 'LOCK_LIQUIDITY',
    tx_hash: '0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    block_number: 19_284_698,
    gas_used: 89_200,
    status: 'SUCCESS',
    network: 'ethereum',
    oracle_signature: '0xdeadbeef12345678',
  },
  {
    id: 'tx-003',
    simulation_id: 'sim-000',
    timestamp: subHours(now, 2).toISOString(),
    action: 'UNLOCK_LIQUIDITY',
    tx_hash: '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8',
    block_number: 19_284_512,
    gas_used: 76_800,
    status: 'SUCCESS',
    network: 'ethereum',
    oracle_signature: '0xcafebabe87654321',
  },
  {
    id: 'tx-004',
    simulation_id: 'sim-prev',
    timestamp: subHours(now, 5).toISOString(),
    action: 'EMERGENCY_TRANSFER',
    tx_hash: '0x3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4',
    block_number: 19_283_998,
    gas_used: 225_600,
    status: 'SUCCESS',
    network: 'ethereum',
    oracle_signature: '0xfeed1234abcd5678',
  },
  {
    id: 'tx-005',
    simulation_id: 'sim-prev2',
    timestamp: subHours(now, 12).toISOString(),
    action: 'REBALANCE_TREASURY',
    tx_hash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
    block_number: 19_283_200,
    gas_used: 138_000,
    status: 'PENDING',
    network: 'ethereum',
    oracle_signature: '0x1234567890abcdef',
  },
]

// ─── Audit Records ──────────────────────────────────────────────────────────
export const mockAuditLogs: AuditRecord[] = [
  {
    id: 'audit-001',
    tx_id: 'tx-001',
    timestamp: subMinutes(now, 8).toISOString(),
    risk_score: 0.67,
    var_95: 1_840_000,
    confidence: 0.94,
    action: 'REBALANCE_TREASURY',
    tx_hash: '0x4a8f2e9d1c3b7f6e5a4d8c2b9e7f1a3d5c8b2e4f6a8c0d2e4f6a8c0d2e4f6a8',
    icp_record_id: 'icp-aaaa-bbbb-cccc-dddd-001',
    summary: 'Automatic rebalance triggered: liquidity ratio dropped to 0.62, VaR exceeded threshold',
  },
  {
    id: 'audit-002',
    tx_id: 'tx-002',
    timestamp: subMinutes(now, 45).toISOString(),
    risk_score: 0.82,
    var_95: 2_450_000,
    confidence: 0.97,
    action: 'LOCK_LIQUIDITY',
    tx_hash: '0x1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    icp_record_id: 'icp-aaaa-bbbb-cccc-dddd-002',
    summary: 'Emergency lock triggered: counterparty risk spike detected, risk probability 82%',
  },
  {
    id: 'audit-003',
    tx_id: 'tx-003',
    timestamp: subHours(now, 2).toISOString(),
    risk_score: 0.31,
    var_95: 980_000,
    confidence: 0.89,
    action: 'UNLOCK_LIQUIDITY',
    tx_hash: '0x9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b3a2f1e0d9c8b7a6f5e4d3c2b1a0f9e8',
    icp_record_id: 'icp-aaaa-bbbb-cccc-dddd-003',
    summary: 'Conditions normalized: risk probability below 35%, unlocking liquidity reserves',
  },
  {
    id: 'audit-004',
    tx_id: 'tx-004',
    timestamp: subHours(now, 5).toISOString(),
    risk_score: 0.91,
    var_95: 3_200_000,
    confidence: 0.99,
    action: 'EMERGENCY_TRANSFER',
    tx_hash: '0x3f4e5d6c7b8a9f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4',
    icp_record_id: 'icp-aaaa-bbbb-cccc-dddd-004',
    summary: 'CRITICAL: Anomaly score 0.91, emergency transfer of $3.2M to safe custody wallet',
  },
  {
    id: 'audit-005',
    tx_id: 'tx-005',
    timestamp: subHours(now, 12).toISOString(),
    risk_score: 0.58,
    var_95: 1_560_000,
    confidence: 0.91,
    action: 'REBALANCE_TREASURY',
    tx_hash: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
    icp_record_id: 'icp-aaaa-bbbb-cccc-dddd-005',
    summary: 'Scheduled rebalance: debt exposure rebalanced to maintain target liquidity ratio',
  },
]

// ─── VaR Trend Data ─────────────────────────────────────────────────────────
export const mockVaRTrend: VaRDataPoint[] = Array.from({ length: 48 }, (_, i) => ({
  timestamp: subHours(now, 48 - i).toISOString(),
  var_95: 1_200_000 + Math.sin(i * 0.3) * 400_000 + Math.random() * 200_000,
  var_99: 1_800_000 + Math.sin(i * 0.3) * 600_000 + Math.random() * 300_000,
  risk_probability: Math.max(0.1, Math.min(0.95, 0.45 + Math.sin(i * 0.25) * 0.25 + Math.random() * 0.05)),
}))

// ─── Heatmap Data ────────────────────────────────────────────────────────────
export const mockHeatmapData = Array.from({ length: 7 }, (_, day) =>
  Array.from({ length: 24 }, (_, hour) => ({
    day,
    hour,
    value: Math.max(
      0,
      Math.min(
        1,
        0.3
        + 0.3 * Math.sin((hour - 10) * 0.3)
        + (day >= 5 ? 0.15 : 0)  // weekends higher
        + Math.random() * 0.25
        - (hour < 6 || hour > 22 ? 0.2 : 0)  // low at night
      )
    ),
  }))
).flat()

// ─── Oracle Decision Feed ────────────────────────────────────────────────────
export const mockOracleDecisions = [
  {
    id: 'decision-001',
    timestamp: subMinutes(now, 8).toISOString(),
    action: 'REBALANCE_TREASURY',
    risk_score: 0.67,
    reasoning: 'Liquidity ratio (0.62) fell below minimum threshold (0.65). Market volatility elevated at 38%. Bayesian model recommends portfolio rebalancing to restore target allocation.',
  },
  {
    id: 'decision-002',
    timestamp: subMinutes(now, 45).toISOString(),
    action: 'LOCK_LIQUIDITY',
    risk_score: 0.82,
    reasoning: 'Counterparty exposure spiked to $9.1M. Monte Carlo simulation: 82% probability of loss exceeding VaR-95. Emergency lock triggered per risk policy #7.',
  },
  {
    id: 'decision-003',
    timestamp: subHours(now, 2).toISOString(),
    action: 'UNLOCK_LIQUIDITY',
    risk_score: 0.31,
    reasoning: 'Risk conditions normalized. Counterparty risk returned to baseline (0.22). Liquidity ratio recovered to 0.74. Unlock approved for normal operations.',
  },
  {
    id: 'decision-004',
    timestamp: subHours(now, 5).toISOString(),
    action: 'EMERGENCY_TRANSFER',
    risk_score: 0.91,
    reasoning: 'CRITICAL anomaly score 0.91 detected. Unusual withdrawal pattern combined with market volatility spike. Emergency protocol activated: $3.2M secured in cold storage.',
  },
  {
    id: 'decision-005',
    timestamp: subHours(now, 12).toISOString(),
    action: 'REBALANCE_TREASURY',
    risk_score: 0.58,
    reasoning: 'Debt exposure (18.3% of portfolio) exceeded target (17%). Scheduled rebalancing executed. No emergency conditions present.',
  },
]

// ─── Activity Feed Messages ──────────────────────────────────────────────────
export const mockActivityMessages = [
  { type: 'AGENT_CYCLE' as const, payload: { cycle: 142, duration_ms: 847 }, ts: subMinutes(now, 1) },
  { type: 'RISK_UPDATE' as const, payload: { risk_level: 'MEDIUM', probability: 0.47 }, ts: subMinutes(now, 3) },
  { type: 'AGENT_CYCLE' as const, payload: { cycle: 141, duration_ms: 923 }, ts: subMinutes(now, 6) },
  { type: 'TX_CONFIRMED' as const, payload: { action: 'REBALANCE_TREASURY', block: 19284712 }, ts: subMinutes(now, 8) },
  { type: 'ACTION_TRIGGERED' as const, payload: { action: 'REBALANCE_TREASURY', reason: 'VaR threshold breach' }, ts: subMinutes(now, 9) },
  { type: 'RISK_UPDATE' as const, payload: { risk_level: 'HIGH', probability: 0.73 }, ts: subMinutes(now, 10) },
  { type: 'AGENT_CYCLE' as const, payload: { cycle: 140, duration_ms: 789 }, ts: subMinutes(now, 16) },
  { type: 'RISK_UPDATE' as const, payload: { risk_level: 'MEDIUM', probability: 0.51 }, ts: subMinutes(now, 21) },
  { type: 'AGENT_CYCLE' as const, payload: { cycle: 139, duration_ms: 1024 }, ts: subMinutes(now, 26) },
  { type: 'RISK_UPDATE' as const, payload: { risk_level: 'LOW', probability: 0.28 }, ts: subMinutes(now, 31) },
]
