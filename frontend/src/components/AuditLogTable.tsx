import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'
import { Download, ChevronLeft, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import StatusBadge from './StatusBadge'
import type { AuditRecord } from '../types'

interface AuditLogTableProps {
  logs: AuditRecord[]
  loading: boolean
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

function RiskScoreBar({ score }: { score: number }) {
  const pct = Math.min(score * 100, 100)
  const color =
    score < 0.3 ? 'bg-success'
    : score < 0.6 ? 'bg-warning'
    : score < 0.8 ? 'bg-danger'
    : 'bg-critical'

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-white/08 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={clsx('h-full rounded-full', color)}
        />
      </div>
      <span
        className={clsx(
          'text-xs font-semibold mono-num',
          score < 0.3 ? 'text-success' : score < 0.6 ? 'text-warning' : 'text-danger'
        )}
      >
        {(score * 100).toFixed(1)}%
      </span>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded shimmer" style={{ width: `${50 + Math.random() * 50}%` }} />
        </td>
      ))}
    </tr>
  )
}

function exportCSV(logs: AuditRecord[]) {
  const headers = [
    'Timestamp', 'Action', 'Risk Score', 'VaR 95%', 'Confidence', 'ICP Record ID', 'TX Hash', 'Summary'
  ]
  const rows = logs.map((l) => [
    l.timestamp,
    l.action,
    l.risk_score,
    l.var_95,
    l.confidence,
    l.icp_record_id,
    l.tx_hash,
    `"${l.summary.replace(/"/g, '""')}"`,
  ])
  const csv = [headers, ...rows].map((r) => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function AuditLogTable({
  logs,
  loading,
  page,
  totalPages,
  onPageChange,
}: AuditLogTableProps) {
  const actionColor: Record<string, string> = {
    LOCK_LIQUIDITY: 'text-danger',
    UNLOCK_LIQUIDITY: 'text-success',
    REBALANCE_TREASURY: 'text-indigo-400',
    EMERGENCY_TRANSFER: 'text-red-400',
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/06">
        <div>
          <h3 className="text-base font-bold text-white">ICP Audit Records</h3>
          <p className="text-xs text-white/40 mt-0.5">
            Immutable on-chain audit trail — Page {page} of {totalPages}
          </p>
        </div>
        <button
          onClick={() => exportCSV(logs)}
          className="btn-ghost text-xs gap-2"
        >
          <Download className="w-3.5 h-3.5" />
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Risk Score</th>
              <th>VaR 95%</th>
              <th>Confidence</th>
              <th>ICP Record ID</th>
              <th>TX Hash</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-white/30 text-sm">
                  No audit records found.
                </td>
              </tr>
            ) : (
              logs.map((log, idx) => (
                <motion.tr
                  key={log.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="group"
                >
                  <td className="mono-num text-xs text-white/50">
                    {(() => {
                      try {
                        return format(parseISO(log.timestamp), 'MMM dd HH:mm:ss')
                      } catch {
                        return log.timestamp
                      }
                    })()}
                  </td>

                  <td>
                    <span
                      className={clsx(
                        'text-xs font-semibold tracking-wide uppercase',
                        actionColor[log.action] ?? 'text-white/60'
                      )}
                    >
                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>

                  <td>
                    <RiskScoreBar score={log.risk_score} />
                  </td>

                  <td>
                    <span className="mono-num text-xs text-white/70">
                      ${log.var_95.toLocaleString()}
                    </span>
                  </td>

                  <td>
                    <span
                      className={clsx(
                        'mono-num text-xs font-semibold',
                        log.confidence > 0.9 ? 'text-success' : log.confidence > 0.7 ? 'text-warning' : 'text-danger'
                      )}
                    >
                      {(log.confidence * 100).toFixed(1)}%
                    </span>
                  </td>

                  <td>
                    <span
                      className="mono-num text-xs text-purple-400 cursor-pointer hover:text-purple-300 transition-colors"
                      title={log.icp_record_id}
                    >
                      {log.icp_record_id.slice(0, 12)}...
                    </span>
                  </td>

                  <td>
                    <span className="mono-num text-xs text-indigo-400">
                      {log.tx_hash.slice(0, 8)}...{log.tx_hash.slice(-6)}
                    </span>
                  </td>
                </motion.tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/06">
          <span className="text-xs text-white/40">
            Page {page} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded-lg bg-white/04 border border-white/08 text-white/50 hover:text-white hover:bg-white/08 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p = i + 1
              return (
                <button
                  key={p}
                  onClick={() => onPageChange(p)}
                  className={clsx(
                    'w-8 h-8 rounded-lg text-xs font-semibold transition-all',
                    p === page
                      ? 'bg-indigo-500 text-white'
                      : 'bg-white/04 border border-white/08 text-white/50 hover:text-white hover:bg-white/08'
                  )}
                >
                  {p}
                </button>
              )
            })}

            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded-lg bg-white/04 border border-white/08 text-white/50 hover:text-white hover:bg-white/08 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
