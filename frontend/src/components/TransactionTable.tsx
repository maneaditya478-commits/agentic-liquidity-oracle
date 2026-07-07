import { motion, AnimatePresence } from 'framer-motion'
import { useState, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { Copy, ExternalLink, CheckCheck } from 'lucide-react'
import clsx from 'clsx'
import StatusBadge from './StatusBadge'
import type { BlockchainTransaction, ActionType } from '../types'

interface TransactionTableProps {
  transactions: BlockchainTransaction[]
  loading?: boolean
  maxRows?: number
}

function truncateHash(hash: string, chars = 8): string {
  if (!hash || hash.length < chars * 2) return hash
  return `${hash.slice(0, chars)}...${hash.slice(-chars)}`
}

function formatAction(action: ActionType): string {
  return action.replace(/_/g, ' ')
}

function actionColor(action: ActionType): string {
  switch (action) {
    case 'LOCK_LIQUIDITY':
      return 'text-danger'
    case 'UNLOCK_LIQUIDITY':
      return 'text-success'
    case 'REBALANCE_TREASURY':
      return 'text-indigo-400'
    case 'EMERGENCY_TRANSFER':
      return 'text-red-400'
    default:
      return 'text-white/60'
  }
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 rounded shimmer" style={{ width: `${60 + Math.random() * 40}%` }} />
        </td>
      ))}
    </tr>
  )
}

export default function TransactionTable({
  transactions,
  loading = false,
  maxRows = 20,
}: TransactionTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const handleCopy = useCallback((hash: string, id: string) => {
    navigator.clipboard.writeText(hash).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }, [])

  const displayed = transactions.slice(0, maxRows)

  return (
    <div className="glass-card overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/06">
        <div>
          <h3 className="text-base font-bold text-white">Blockchain Transactions</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {transactions.length} total transactions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success pulse-dot" />
          <span className="text-xs text-white/40">Live</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Tx Hash</th>
              <th>Block #</th>
              <th>Gas Used</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
            ) : displayed.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-white/30 text-sm">
                  No transactions yet. AI agent actions will appear here.
                </td>
              </tr>
            ) : (
              <AnimatePresence mode="popLayout">
                {displayed.map((tx, idx) => (
                  <motion.tr
                    key={tx.id}
                    initial={{ opacity: 0, x: -20, backgroundColor: 'rgba(99,102,241,0.1)' }}
                    animate={{
                      opacity: 1,
                      x: 0,
                      backgroundColor: 'rgba(0,0,0,0)',
                    }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    className="group"
                  >
                    <td className="mono-num text-xs text-white/50">
                      {(() => {
                        try {
                          return format(parseISO(tx.timestamp), 'MMM dd HH:mm:ss')
                        } catch {
                          return tx.timestamp
                        }
                      })()}
                    </td>

                    <td>
                      <span
                        className={clsx(
                          'text-xs font-semibold tracking-wide uppercase',
                          actionColor(tx.action)
                        )}
                      >
                        {formatAction(tx.action)}
                      </span>
                    </td>

                    <td>
                      <div className="flex items-center gap-2">
                        <span className="mono-num text-xs text-indigo-400">
                          {truncateHash(tx.tx_hash)}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleCopy(tx.tx_hash, tx.id)}
                            className="p-1 rounded hover:bg-white/08 text-white/40 hover:text-white transition-all"
                            title="Copy hash"
                          >
                            {copiedId === tx.id ? (
                              <CheckCheck className="w-3 h-3 text-success" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <a
                            href={`https://etherscan.io/tx/${tx.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded hover:bg-white/08 text-white/40 hover:text-white transition-all"
                            title="View on explorer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="mono-num text-xs text-white/60">
                        #{tx.block_number.toLocaleString()}
                      </span>
                    </td>

                    <td>
                      <span className="mono-num text-xs text-white/60">
                        {tx.gas_used.toLocaleString()}
                      </span>
                    </td>

                    <td>
                      <StatusBadge
                        status={tx.status}
                        size="sm"
                      />
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
