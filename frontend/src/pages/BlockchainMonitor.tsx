import { motion } from 'framer-motion'
import { useState, useEffect } from 'react'
import {
  Link2,
  Shield,
  ShieldOff,
  Cpu,
  Globe,
  Clock,
  RefreshCw,
  Hash,
  Wallet,
  AlertTriangle,
  CheckCircle,
  Zap,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import clsx from 'clsx'
import StatusBadge from '../components/StatusBadge'
import TransactionTable from '../components/TransactionTable'
import { useStore } from '../store/useStore'
import {
  mockTransactions,
  mockTreasuryStatus,
  mockOracleDecisions,
} from '../data/mockData'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
}

function actionIcon(action: string) {
  switch (action) {
    case 'LOCK_LIQUIDITY': return <Shield className="w-4 h-4 text-danger" />
    case 'UNLOCK_LIQUIDITY': return <ShieldOff className="w-4 h-4 text-success" />
    case 'REBALANCE_TREASURY': return <RefreshCw className="w-4 h-4 text-indigo-400" />
    case 'EMERGENCY_TRANSFER': return <AlertTriangle className="w-4 h-4 text-red-400" />
    default: return <Zap className="w-4 h-4 text-white/40" />
  }
}

function actionBg(action: string): string {
  switch (action) {
    case 'LOCK_LIQUIDITY': return 'bg-danger/10 border-danger/20'
    case 'UNLOCK_LIQUIDITY': return 'bg-success/10 border-success/20'
    case 'REBALANCE_TREASURY': return 'bg-indigo-500/10 border-indigo-500/20'
    case 'EMERGENCY_TRANSFER': return 'bg-red-500/15 border-red-500/30'
    default: return 'bg-white/04 border-white/08'
  }
}

export default function BlockchainMonitor() {
  const { transactions: liveTxns, treasuryStatus: liveStatus } = useStore()
  const [blockHeight, setBlockHeight] = useState(19_284_712)
  const [refreshing, setRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(new Date())

  const transactions = liveTxns.length > 0 ? liveTxns : mockTransactions
  const status = liveStatus ?? mockTreasuryStatus

  // Simulate live block counter
  useEffect(() => {
    const interval = setInterval(() => {
      setBlockHeight((h) => h + Math.floor(Math.random() * 2))
    }, 12000) // ~12s per Ethereum block
    return () => clearInterval(interval)
  }, [])

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date())
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await new Promise((r) => setTimeout(r, 1000))
    setLastRefresh(new Date())
    setRefreshing(false)
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className="space-y-6"
    >
      {/* ─── Header ─── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Blockchain{' '}
            <span className="gradient-text">Monitor</span>
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Smart contract status, oracle decisions & on-chain transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30">
            Last refresh: {format(lastRefresh, 'HH:mm:ss')}
          </span>
          <button onClick={handleRefresh} className="btn-ghost">
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            Refresh
          </button>
        </div>
      </div>

      {/* ─── Contract Status Panel ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Contract Info Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className={clsx(
            'glass-card p-6 relative overflow-hidden',
            status.is_locked && 'border-danger/30'
          )}
        >
          {status.is_locked && (
            <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-danger to-red-400" />
          )}

          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-base font-bold text-white">Smart Contract Status</h2>
              <p className="text-xs text-white/40 mt-0.5">Treasury Oracle v2 — Ethereum Mainnet</p>
            </div>
            <StatusBadge
              status={status.is_locked ? 'LOCKED' : 'UNLOCKED'}
              size="lg"
            />
          </div>

          <div className="space-y-4">
            {[
              {
                icon: Globe,
                label: 'Network',
                value: 'Ethereum Mainnet',
                mono: false,
                color: 'text-indigo-400',
              },
              {
                icon: Wallet,
                label: 'Oracle Address',
                value: '0x742d35Cc6634C0532925a3b8D4C9E9e0e2c8d2a1',
                mono: true,
                color: 'text-white/70',
              },
              {
                icon: Hash,
                label: 'Block Height',
                value: `#${blockHeight.toLocaleString()}`,
                mono: true,
                color: 'text-purple-400',
              },
              {
                icon: Cpu,
                label: 'Protected Amount',
                value: `$${(status.metric.total_balance / 1_000_000).toFixed(2)}M`,
                mono: true,
                color: 'text-success',
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-4 p-3 rounded-xl bg-white/03 border border-white/04">
                <div className="p-2 rounded-lg bg-white/06">
                  <item.icon className="w-4 h-4 text-white/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/40">{item.label}</p>
                  <p className={clsx('text-sm font-semibold truncate', item.mono && 'mono-num', item.color)}>
                    {item.value}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Lock status banner */}
          {status.is_locked && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-3 p-3 rounded-xl bg-danger/10 border border-danger/20"
            >
              <Shield className="w-5 h-5 text-danger shrink-0" />
              <div>
                <p className="text-sm font-semibold text-danger">Liquidity Locked</p>
                <p className="text-xs text-danger/70">Oracle has locked treasury operations. Emergency protocol active.</p>
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* Live Block Stats */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-6"
        >
          <h2 className="text-base font-bold text-white mb-6">Network Statistics</h2>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Current Block', value: blockHeight.toLocaleString(), color: 'text-indigo-400', sub: '~12s avg block time' },
              { label: 'Oracle Transactions', value: transactions.length.toString(), color: 'text-purple-400', sub: 'Total on-chain' },
              { label: 'Success Rate', value: `${((transactions.filter(t => t.status === 'SUCCESS').length / Math.max(transactions.length, 1)) * 100).toFixed(0)}%`, color: 'text-success', sub: 'Execution success' },
              { label: 'Avg Gas Used', value: (transactions.reduce((a, t) => a + t.gas_used, 0) / Math.max(transactions.length, 1) / 1000).toFixed(0) + 'K', color: 'text-warning', sub: 'Per transaction' },
            ].map((stat) => (
              <div key={stat.label} className="p-4 rounded-xl bg-white/03 border border-white/06 text-center">
                <p className={clsx('text-2xl font-bold mono-num', stat.color)}>{stat.value}</p>
                <p className="text-xs font-medium text-white/60 mt-1">{stat.label}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{stat.sub}</p>
              </div>
            ))}
          </div>

          {/* Transaction type breakdown */}
          <div className="mt-4 pt-4 border-t border-white/06">
            <p className="text-xs text-white/40 mb-3 uppercase tracking-wider">Action Breakdown</p>
            {[
              { action: 'REBALANCE_TREASURY', label: 'Rebalance', color: 'bg-indigo-500' },
              { action: 'LOCK_LIQUIDITY', label: 'Lock', color: 'bg-danger' },
              { action: 'UNLOCK_LIQUIDITY', label: 'Unlock', color: 'bg-success' },
              { action: 'EMERGENCY_TRANSFER', label: 'Emergency', color: 'bg-red-600' },
            ].map((item) => {
              const count = transactions.filter((t) => t.action === item.action).length
              const pct = (count / Math.max(transactions.length, 1)) * 100
              return (
                <div key={item.action} className="flex items-center gap-3 mb-2">
                  <span className="text-xs text-white/40 w-20 shrink-0">{item.label}</span>
                  <div className="flex-1 h-1.5 bg-white/06 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, delay: 0.3 }}
                      className={clsx('h-full rounded-full', item.color)}
                    />
                  </div>
                  <span className="text-xs mono-num text-white/50 w-8 text-right">{count}</span>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>

      {/* ─── Oracle Decision Cards ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">
          Recent Oracle Decisions
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mockOracleDecisions.slice(0, 5).map((decision, i) => (
            <motion.div
              key={decision.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 + 0.25 }}
              className={clsx(
                'glass-card p-4 border',
                actionBg(decision.action)
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-white/08">
                    {actionIcon(decision.action)}
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white/80 uppercase tracking-wider">
                      {decision.action.replace(/_/g, ' ')}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className="w-3 h-3 text-white/30" />
                      <p className="text-[10px] text-white/40 mono-num">
                        {(() => {
                          try {
                            return format(parseISO(decision.timestamp), 'MMM dd HH:mm')
                          } catch {
                            return decision.timestamp
                          }
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={clsx(
                    'text-xs font-bold mono-num px-2 py-0.5 rounded-full',
                    decision.risk_score > 0.8 ? 'bg-danger/20 text-danger' :
                    decision.risk_score > 0.6 ? 'bg-warning/20 text-warning' :
                    'bg-success/20 text-success'
                  )}>
                    {(decision.risk_score * 100).toFixed(0)}%
                  </span>
                  {decision.risk_score < 0.5 ? (
                    <CheckCircle className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  )}
                </div>
              </div>

              <p className="text-xs text-white/50 leading-relaxed line-clamp-3">
                {decision.reasoning}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ─── Transaction Table ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <TransactionTable transactions={transactions} maxRows={20} />
      </motion.div>
    </motion.div>
  )
}
