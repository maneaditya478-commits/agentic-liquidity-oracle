import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { motion } from 'framer-motion'

interface MonteCarloChartProps {
  distribution: Array<{ bin: number; count: number }>
  var95: number
  var99: number
  title?: string
}

interface TooltipPayload {
  value: number
  dataKey: string
  payload: { bin: number; count: number }
}

const CustomTooltip = ({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayload[]
}) => {
  if (active && payload && payload.length > 0) {
    const d = payload[0].payload
    return (
      <div className="glass-card px-4 py-3 min-w-[160px]">
        <p className="text-xs text-white/50 mb-1.5 font-medium uppercase tracking-wider">
          Loss Range
        </p>
        <p className="text-sm text-white font-semibold mono-num">
          ${d.bin.toLocaleString()} – ${(d.bin + 1000).toLocaleString()}
        </p>
        <div className="h-px bg-white/08 my-2" />
        <p className="text-xs text-white/50">Simulations</p>
        <p className="text-lg font-bold text-indigo-400 mono-num">{d.count.toLocaleString()}</p>
      </div>
    )
  }
  return null
}

export default function MonteCarloChart({
  distribution,
  var95,
  var99,
  title = 'Monte Carlo Loss Distribution',
}: MonteCarloChartProps) {
  const maxCount = Math.max(...distribution.map((d) => d.count))

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="glass-card p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-white">{title}</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {distribution.reduce((a, b) => a + b.count, 0).toLocaleString()} simulated paths
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-warning rounded" style={{ borderTop: '2px dashed #f59e0b' }} />
            <span className="text-white/50">VaR 95%</span>
            <span className="text-warning font-semibold mono-num">${var95.toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-danger rounded" style={{ borderTop: '2px dashed #ef4444' }} />
            <span className="text-white/50">VaR 99%</span>
            <span className="text-danger font-semibold mono-num">${var99.toLocaleString()}</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <AreaChart
          data={distribution}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
        >
          <defs>
            <linearGradient id="mcGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} />
              <stop offset="60%" stopColor="#6366f1" stopOpacity={0.2} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="mcGradientDanger" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="bin"
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v.toLocaleString()}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* VaR 95% reference line */}
          <ReferenceLine
            x={var95}
            stroke="#f59e0b"
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{
              value: 'VaR 95%',
              position: 'top',
              fill: '#f59e0b',
              fontSize: 10,
              fontWeight: 600,
            }}
          />

          {/* VaR 99% reference line */}
          <ReferenceLine
            x={var99}
            stroke="#ef4444"
            strokeDasharray="5 3"
            strokeWidth={2}
            label={{
              value: 'VaR 99%',
              position: 'top',
              fill: '#ef4444',
              fontSize: 10,
              fontWeight: 600,
            }}
          />

          <Area
            type="monotone"
            dataKey="count"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#mcGradient)"
            dot={false}
            activeDot={{ r: 5, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={1200}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
