import { motion } from 'framer-motion'
import { useState, useMemo } from 'react'
import {
  Download,
  Filter,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  Clock,
  RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import MonteCarloChart from '../components/MonteCarloChart'
import VaRTrendChart from '../components/VaRTrendChart'
import HeatmapChart from '../components/HeatmapChart'
import { useStore } from '../store/useStore'
import {
  mockSimulation,
  mockVaRTrend,
  mockHeatmapData,
  mockRiskHistory,
} from '../data/mockData'

const pageVariants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.25 } },
}

const TIME_RANGES = [
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '24H', hours: 24 },
  { label: '7D', hours: 168 },
]

export default function RiskAnalytics() {
  const { riskHistory } = useStore()
  const [timeRange, setTimeRange] = useState(24)
  const [loading, setLoading] = useState(false)

  // Use live data if available, fallback to mock
  const history = riskHistory.length > 0 ? riskHistory : mockRiskHistory

  const varTrend = useMemo(() => {
    const cutoff = new Date(Date.now() - timeRange * 60 * 60 * 1000)
    return mockVaRTrend.filter((d) => new Date(d.timestamp) >= cutoff)
  }, [timeRange])

  const sim = mockSimulation

  const latestRisk = history[0]
  const avgRisk = history.reduce((a, b) => a + b.risk_probability, 0) / history.length
  const maxRisk = Math.max(...history.map((h) => h.risk_probability))
  const criticalCount = history.filter((h) => h.risk_level === 'CRITICAL').length

  const handleRefresh = async () => {
    setLoading(true)
    await new Promise((r) => setTimeout(r, 1200))
    setLoading(false)
  }

  const handleExport = () => {
    const csv = [
      ['timestamp', 'risk_level', 'risk_probability', 'model_version'],
      ...history.map((h) => [h.timestamp, h.risk_level, h.risk_probability, h.model_version]),
    ]
      .map((row) => row.join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'risk-analytics.csv'
    a.click()
    URL.revokeObjectURL(url)
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
            Risk{' '}
            <span className="gradient-text">Analytics</span>
          </h1>
          <p className="text-sm text-white/40 mt-1">
            Monte Carlo simulations, VaR analysis & volatility heatmaps
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time range selector */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/04 border border-white/08">
            {TIME_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setTimeRange(r.hours)}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                  timeRange === r.hours
                    ? 'bg-indigo-500 text-white shadow-lg'
                    : 'text-white/50 hover:text-white hover:bg-white/06'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button onClick={handleRefresh} className="btn-ghost">
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
          </button>
          <button onClick={handleExport} className="btn-ghost">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* ─── Stats Summary Row ─── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Current Risk',
            value: `${((latestRisk?.risk_probability ?? 0.47) * 100).toFixed(1)}%`,
            sub: latestRisk?.risk_level ?? 'MEDIUM',
            icon: AlertTriangle,
            color: 'text-warning',
            bg: 'bg-warning/10',
          },
          {
            label: 'Avg Risk (Period)',
            value: `${(avgRisk * 100).toFixed(1)}%`,
            sub: `${history.length} data points`,
            icon: BarChart2,
            color: 'text-indigo-400',
            bg: 'bg-indigo-500/10',
          },
          {
            label: 'Peak Risk',
            value: `${(maxRisk * 100).toFixed(1)}%`,
            sub: 'Historical maximum',
            icon: TrendingUp,
            color: 'text-danger',
            bg: 'bg-danger/10',
          },
          {
            label: 'Critical Events',
            value: criticalCount.toString(),
            sub: 'In selected period',
            icon: Clock,
            color: criticalCount > 0 ? 'text-red-400' : 'text-success',
            bg: criticalCount > 0 ? 'bg-red-500/10' : 'bg-success/10',
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
                <p className={clsx('text-xl font-bold mono-num', stat.color)}>{stat.value}</p>
                <p className="text-[10px] text-white/30">{stat.sub}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ─── Monte Carlo Chart (full width) ─── */}
      <MonteCarloChart
        distribution={sim.path_distribution}
        var95={sim.var_95}
        var99={sim.var_99}
        title={`Monte Carlo — ${sim.num_simulations.toLocaleString()} Simulations, ${sim.horizon_hours}h Horizon`}
      />

      {/* ─── VaR Trend Chart (full width) ─── */}
      <VaRTrendChart
        data={varTrend}
        title={`Value at Risk Trend — Last ${timeRange}h`}
      />

      {/* ─── Heatmap + Risk Stats Side by Side ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <HeatmapChart
            data={mockHeatmapData}
            title="7-Day Market Volatility Heatmap"
          />
        </div>

        {/* Risk Stats Table */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-5"
        >
          <h3 className="text-sm font-bold text-white/70 uppercase tracking-wider mb-4">
            Risk Statistics
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Expected Loss', value: `$${(sim.expected_loss / 1000).toFixed(0)}K`, color: 'text-warning' },
              { label: 'VaR 95%', value: `$${(sim.var_95 / 1000).toFixed(0)}K`, color: 'text-warning' },
              { label: 'VaR 99%', value: `$${(sim.var_99 / 1000).toFixed(0)}K`, color: 'text-danger' },
              { label: 'CVaR 95%', value: `$${(sim.cvar_95 / 1000).toFixed(0)}K`, color: 'text-danger' },
              { label: 'Simulations', value: sim.num_simulations.toLocaleString(), color: 'text-indigo-400' },
              { label: 'Horizon', value: `${sim.horizon_hours}h`, color: 'text-purple-400' },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between py-2 border-b border-white/04 last:border-0"
              >
                <span className="text-xs text-white/50">{item.label}</span>
                <span className={clsx('text-sm font-bold mono-num', item.color)}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-white/08">
            <p className="text-[10px] text-white/30 leading-relaxed">
              Monte Carlo simulation using 10,000 paths with Geometric Brownian Motion and fat-tail corrections. Bayesian risk model v2.3.1.
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
