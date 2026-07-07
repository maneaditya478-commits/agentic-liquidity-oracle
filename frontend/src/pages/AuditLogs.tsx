import { motion } from 'framer-motion'
import { useState } from 'react'
import {
  FileText,
  Filter,
  Database,
  Shield,
  RefreshCw,
  Calendar,
  ChevronDown,
} from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import AuditLogTable from '../components/AuditLogTable'
import { useStore } from '../store/useStore'
import { mockAuditLogs } from '../data/mockData'
import type { ActionType } from '../types'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
}

const ACTION_FILTERS: Array<{ label: string; value: ActionType | 'ALL' }> = [
  { label: 'All Actions', value: 'ALL' },
  { label: 'Lock', value: 'LOCK_LIQUIDITY' },
  { label: 'Unlock', value: 'UNLOCK_LIQUIDITY' },
  { label: 'Rebalance', value: 'REBALANCE_TREASURY' },
  { label: 'Emergency', value: 'EMERGENCY_TRANSFER' },
]

const RISK_FILTERS = [
  { label: 'All Levels', value: 'ALL' },
  { label: 'Low (< 30%)', value: 'LOW' },
  { label: 'Medium (30-60%)', value: 'MEDIUM' },
  { label: 'High (> 60%)', value: 'HIGH' },
]

const PAGE_SIZE = 5

export default function AuditLogs() {
  const { auditLogs } = useStore()
  const [page, setPage] = useState(1)
  const [actionFilter, setActionFilter] = useState<ActionType | 'ALL'>('ALL')
  const [riskFilter, setRiskFilter] = useState('ALL')
  const [loading, setLoading] = useState(false)

  // Use live data if available, fallback to mock (repeated for more rows)
  const baseLogs = auditLogs.length > 0 ? auditLogs : [
    ...mockAuditLogs,
    ...mockAuditLogs.map((l) => ({ ...l, id: l.id + '-b', timestamp: new Date(new Date(l.timestamp).getTime() - 86400000).toISOString() })),
    ...mockAuditLogs.map((l) => ({ ...l, id: l.id + '-c', timestamp: new Date(new Date(l.timestamp).getTime() - 172800000).toISOString() })),
  ]

  const filteredLogs = baseLogs.filter((log) => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false
    if (riskFilter === 'LOW' && log.risk_score >= 0.3) return false
    if (riskFilter === 'MEDIUM' && (log.risk_score < 0.3 || log.risk_score >= 0.6)) return false
    if (riskFilter === 'HIGH' && log.risk_score < 0.6) return false
    return true
  })

  const totalPages = Math.ceil(filteredLogs.length / PAGE_SIZE)
  const pageLogs = filteredLogs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const handleRefresh = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1000))
    setLoading(false)
  }

  // Summary stats
  const totalRecords = baseLogs.length
  const lastAction = baseLogs[0]
  const uniqueICPRecords = new Set(baseLogs.map((l) => l.icp_record_id)).size

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
            Audit{' '}
            <span className="gradient-text">Logs</span>
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Immutable audit trail on Internet Computer Protocol
          </p>
        </div>
        <button onClick={handleRefresh} className="btn-ghost">
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* ─── Summary Stats ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: FileText,
            label: 'Total Audit Records',
            value: totalRecords.toLocaleString(),
            sub: 'All time',
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/10',
          },
          {
            icon: Database,
            label: 'ICP Canister Records',
            value: uniqueICPRecords.toLocaleString(),
            sub: 'Canister: rdmx6-jaaaa-aaaaa-aaadq-cai',
            color: 'text-purple-400',
            bg: 'bg-purple-500/10',
          },
          {
            icon: Shield,
            label: 'Last Action',
            value: lastAction ? lastAction.action.replace(/_/g, ' ') : 'None',
            sub: lastAction ? format(new Date(lastAction.timestamp), 'MMM dd HH:mm') : '—',
            color: 'text-success',
            bg: 'bg-success/10',
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-3">
              <div className={clsx('p-2.5 rounded-xl', stat.bg)}>
                <stat.icon className={clsx('w-5 h-5', stat.color)} />
              </div>
              <div>
                <p className="text-xs text-white/40">{stat.label}</p>
                <p className={clsx('text-lg font-bold', stat.color)}>{stat.value}</p>
                <p className="text-[10px] text-white/30 mono-num">{stat.sub}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── ICP Canister Info ─── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass-card p-5 border border-purple-500/20"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-xl bg-purple-500/15">
            <Database className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">ICP Canister Status</h3>
            <p className="text-xs text-white/40">Internet Computer Protocol — Immutable Record Storage</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success pulse-dot" />
            <span className="text-xs text-success">Online</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Canister ID', value: 'rdmx6-jaaaa-aaaaa-aaadq-cai', mono: true },
            { label: 'Total Records', value: totalRecords.toLocaleString(), mono: true },
            { label: 'Subnet', value: 'NNS (System)', mono: false },
            { label: 'Memory Used', value: '2.4 MB', mono: true },
          ].map((item) => (
            <div key={item.label} className="p-3 rounded-xl bg-white/03 border border-white/04">
              <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{item.label}</p>
              <p className={clsx('text-xs font-semibold text-purple-300 truncate', item.mono && 'mono-num')}>
                {item.value}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* ─── Filter Bar ─── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="glass-card p-4 flex flex-wrap items-center gap-3"
      >
        <div className="flex items-center gap-2 text-white/50">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-medium">Filters:</span>
        </div>

        {/* Action filter */}
        <div className="flex items-center gap-1">
          {ACTION_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setActionFilter(f.value); setPage(1) }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                actionFilter === f.value
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/04 border border-white/08 text-white/50 hover:text-white hover:bg-white/08'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="h-5 w-px bg-white/08" />

        {/* Risk filter */}
        <div className="flex items-center gap-1">
          {RISK_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setRiskFilter(f.value); setPage(1) }}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                riskFilter === f.value
                  ? 'bg-purple-500 text-white'
                  : 'bg-white/04 border border-white/08 text-white/50 hover:text-white hover:bg-white/08'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="ml-auto text-xs text-white/30">
          {filteredLogs.length} records matching filters
        </div>
      </motion.div>

      {/* ─── Audit Table ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <AuditLogTable
          logs={pageLogs}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </motion.div>
    </motion.div>
  )
}
