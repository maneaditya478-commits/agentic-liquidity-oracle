import { motion, AnimatePresence } from 'framer-motion'
import { useState } from 'react'
import {
  DollarSign,
  Droplets,
  ShieldAlert,
  Lock,
  Unlock,
  RefreshCw,
  Zap,
  Activity,
  Bot,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import MetricCard from '../components/MetricCard'
import RiskGauge from '../components/RiskGauge'
import StatusBadge from '../components/StatusBadge'
import { useStore } from '../store/useStore'
import { useTreasuryData } from '../hooks/useTreasuryData'
import {
  mockTreasuryStatus,
  mockActivityMessages,
  mockTransactions,
} from '../data/mockData'
import type { RiskLevel } from '../types'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
}

function activityIcon(type: string) {
  switch (type) {
    case 'AGENT_CYCLE': return <Bot className="w-3.5 h-3.5 text-indigo-400" />
    case 'RISK_UPDATE': return <Activity className="w-3.5 h-3.5 text-warning" />
    case 'ACTION_TRIGGERED': return <AlertTriangle className="w-3.5 h-3.5 text-danger" />
    case 'TX_CONFIRMED': return <Zap className="w-3.5 h-3.5 text-success" />
    default: return <ChevronRight className="w-3.5 h-3.5 text-white/30" />
  }
}

function activityText(type: string, payload: Record<string, unknown> | undefined, fullMsg?: any): string {
  if (fullMsg && typeof fullMsg === 'object' && 'message' in fullMsg && fullMsg.message) {
    return String(fullMsg.message)
  }
  if (!payload) {
    return 'Live feed update received'
  }
  switch (type) {
    case 'AGENT_CYCLE':
      return `Agent cycle #${payload.cycle ?? '—'} completed in ${payload.duration_ms ?? '—'}ms`
    case 'RISK_UPDATE':
      return `Risk updated: ${payload.risk_level ?? '—'} (${((Number(payload.probability) ?? 0) * 100).toFixed(1)}%)`
    case 'ACTION_TRIGGERED':
      return `Action triggered: ${String(payload.action ?? '—').replace(/_/g, ' ')}`
    case 'TX_CONFIRMED':
      return `TX confirmed: ${String(payload.action ?? '—').replace(/_/g, ' ')} @ block ${payload.block ?? '—'}`
    default: {
      const str = JSON.stringify(payload)
      return str ? str.slice(0, 60) : 'System event'
    }
  }
}

export default function TreasuryOverview() {
  const { user, isAgentRunning, activityFeed } = useStore()
  const { data: liveStatus, loading, refetch } = useTreasuryData()
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Use live data if available, fallback to mock
  const status = liveStatus ?? mockTreasuryStatus
  const metric = status.metric
  const riskLevel = status.risk_level as RiskLevel

  const riskProbPct = status.risk_probability * 100

  const isAdmin = user?.role === 'admin' || !user

  // Merge live activity with mock seed
  const feed = activityFeed.length > 0
    ? activityFeed
    : mockActivityMessages.map((m, i) => ({
        type: m.type,
        payload: { ...m.payload } as Record<string, unknown>,
      }))

  const handleAction = async (action: string) => {
    setActionLoading(action)
    await new Promise((r) => setTimeout(r, 1500))
    setActionLoading(null)
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Treasury{' '}
            <span className="gradient-text">Overview</span>
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Real-time treasury monitoring & AI risk management
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Agent status chip */}
          <div className={clsx(
            'flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold',
            isAgentRunning
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-white/04 border-white/08 text-white/40'
          )}>
            <Bot className="w-4 h-4" />
            {isAgentRunning ? 'Agentic AI Active' : 'Agent Idle'}
            {isAgentRunning && <span className="w-2 h-2 rounded-full bg-success pulse-dot" />}
          </div>
          <button
            onClick={refetch}
            className="btn-ghost"
            title="Refresh data"
          >
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* ─── Metric Cards Row ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Treasury Balance"
          value={metric.total_balance / 1_000_000}
          format="currency"
          prefix="$"
          unit="M"
          change={2.4}
          changeDirection="up"
          icon={DollarSign}
          color="indigo"
          description="Total assets under management"
          index={0}
        />
        <MetricCard
          title="Liquidity Ratio"
          value={metric.liquidity_ratio * 100}
          format="percent"
          change={-1.2}
          changeDirection="down"
          icon={Droplets}
          color={metric.liquidity_ratio < 0.65 ? 'danger' : metric.liquidity_ratio < 0.75 ? 'warning' : 'success'}
          description="Current liquid assets ratio"
          index={1}
        />
        <MetricCard
          title="Risk Score"
          value={riskProbPct}
          format="percent"
          change={5.8}
          changeDirection="up"
          icon={ShieldAlert}
          color={riskProbPct > 80 ? 'danger' : riskProbPct > 60 ? 'warning' : 'success'}
          description="Bayesian risk probability"
          index={2}
        />
        <MetricCard
          title="Cash Reserves"
          value={metric.cash_reserves / 1_000_000}
          format="currency"
          prefix="$"
          unit="M"
          change={0.8}
          changeDirection="up"
          icon={status.is_locked ? Lock : Unlock}
          color={status.is_locked ? 'danger' : 'success'}
          description={status.is_locked ? 'Liquidity locked by oracle' : 'Reserves available'}
          index={3}
        />
      </div>

      {/* ─── Main Content Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ─── Risk Gauge ─── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6 flex flex-col items-center"
        >
          <div className="w-full flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">
              Risk Probability
            </h2>
            <StatusBadge status={riskLevel} size="sm" />
          </div>

          <RiskGauge
            probability={riskProbPct}
            size={240}
            label="AI Bayesian Score"
          />

          <div className="w-full mt-4 grid grid-cols-3 gap-3">
            {[
              { label: 'VaR 95%', value: `$${(status.var_95 / 1000).toFixed(0)}K`, color: 'text-warning' },
              { label: 'Volatility', value: `${(metric.market_volatility * 100).toFixed(1)}%`, color: 'text-indigo-400' },
              { label: 'CP Risk', value: `${(metric.counterparty_risk * 100).toFixed(1)}%`, color: 'text-purple-400' },
            ].map((item) => (
              <div key={item.label} className="text-center p-2 rounded-xl bg-white/03 border border-white/06">
                <div className={clsx('text-sm font-bold mono-num', item.color)}>{item.value}</div>
                <div className="text-[10px] text-white/40 mt-0.5">{item.label}</div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* ─── Live Activity Feed ─── */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.35 }}
          className="glass-card p-5 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider">
              Agent Activity Feed
            </h2>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success pulse-dot" />
              <span className="text-xs text-white/40">Live</span>
            </div>
          </div>

          <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
            <AnimatePresence mode="popLayout">
              {feed.map((msg, i) => {
                const mockMsg = mockActivityMessages[i]
                const ts = mockMsg?.ts ?? new Date()
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-xl bg-white/02 border border-white/04 hover:bg-white/04 transition-all"
                  >
                    <div className="mt-0.5 p-1.5 rounded-lg bg-white/06">
                      {activityIcon(msg.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80 leading-relaxed">
                        {activityText(msg.type, msg.payload, msg)}
                      </p>
                      <p className="text-[10px] text-white/30 mt-0.5 mono-num">
                        {format(ts, 'HH:mm:ss')}
                      </p>
                    </div>
                    <span className={clsx(
                      'text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded',
                      msg.type === 'AGENT_CYCLE' ? 'bg-indigo-500/15 text-indigo-400' :
                      msg.type === 'RISK_UPDATE' ? 'bg-warning/15 text-warning' :
                      msg.type === 'ACTION_TRIGGERED' ? 'bg-danger/15 text-danger' :
                      'bg-success/15 text-success'
                    )}>
                      {msg.type.replace('_', ' ')}
                    </span>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>

      {/* ─── Quick Stats + Action Buttons ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Risk Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass-card p-5 lg:col-span-2"
        >
          <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">
            Portfolio Risk Metrics
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {[
              { label: 'Debt Exposure', value: `$${(metric.debt_exposure / 1_000_000).toFixed(2)}M`, sub: `${((metric.debt_exposure / metric.total_balance) * 100).toFixed(1)}% of portfolio`, color: 'text-warning' },
              { label: 'Market Volatility', value: `${(metric.market_volatility * 100).toFixed(1)}%`, sub: metric.market_volatility > 0.5 ? 'Elevated' : 'Normal', color: metric.market_volatility > 0.5 ? 'text-danger' : 'text-success' },
              { label: 'Anomaly Score', value: `${(metric.anomaly_score * 100).toFixed(1)}%`, sub: metric.anomaly_score > 0.5 ? 'Suspicious' : 'Normal', color: metric.anomaly_score > 0.5 ? 'text-danger' : 'text-success' },
              { label: 'Counterparty Risk', value: `${(metric.counterparty_risk * 100).toFixed(1)}%`, sub: metric.counterparty_risk > 0.4 ? 'High exposure' : 'Acceptable', color: metric.counterparty_risk > 0.4 ? 'text-warning' : 'text-success' },
              { label: 'Cash Reserves', value: `$${(metric.cash_reserves / 1_000_000).toFixed(1)}M`, sub: 'Available liquidity', color: 'text-indigo-400' },
              { label: 'Protection Status', value: status.is_locked ? 'LOCKED' : 'ACTIVE', sub: status.is_locked ? 'Oracle locked' : 'Normal operations', color: status.is_locked ? 'text-danger' : 'text-success' },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-xl bg-white/03 border border-white/05">
                <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{item.label}</p>
                <p className={clsx('text-lg font-bold mono-num', item.color)}>{item.value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="glass-card p-5"
        >
          <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">
            Oracle Actions
          </h2>
          <div className="space-y-3">
            <button
              onClick={() => handleAction('analyze')}
              className="btn-primary w-full justify-center py-3"
              disabled={actionLoading === 'analyze'}
            >
              {actionLoading === 'analyze' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Activity className="w-4 h-4" />
              )}
              Run Analysis
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => handleAction('lock')}
                  className="btn-danger w-full justify-center py-3"
                  disabled={actionLoading === 'lock' || status.is_locked}
                >
                  {actionLoading === 'lock' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Lock className="w-4 h-4" />
                  )}
                  {status.is_locked ? 'Already Locked' : 'Lock Liquidity'}
                </button>

                <button
                  onClick={() => handleAction('unlock')}
                  className="btn-success w-full justify-center py-3"
                  disabled={actionLoading === 'unlock' || !status.is_locked}
                >
                  {actionLoading === 'unlock' ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Unlock className="w-4 h-4" />
                  )}
                  {!status.is_locked ? 'Not Locked' : 'Unlock Liquidity'}
                </button>
              </>
            )}

            <div className="pt-3 border-t border-white/06">
              <div className="text-xs text-white/30 space-y-1.5">
                <div className="flex justify-between">
                  <span>Oracle Version</span>
                  <span className="text-white/50 mono-num">v2.3.1</span>
                </div>
                <div className="flex justify-between">
                  <span>Network</span>
                  <span className="text-indigo-400 mono-num">Ethereum</span>
                </div>
                <div className="flex justify-between">
                  <span>Cycle #</span>
                  <span className="text-white/50 mono-num">142</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Update</span>
                  <span className="text-white/50 mono-num">
                    {format(new Date(), 'HH:mm:ss')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
