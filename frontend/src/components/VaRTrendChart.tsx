import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { motion } from 'framer-motion'
import { format, parseISO } from 'date-fns'

interface VaRDataPoint {
  timestamp: string
  var_95: number
  var_99: number
  risk_probability: number
}

interface VaRTrendChartProps {
  data: VaRDataPoint[]
  title?: string
}

interface TooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name: string; color: string }>
  label?: string
}

const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
  if (active && payload && payload.length > 0) {
    return (
      <div className="glass-card px-4 py-3 min-w-[200px]">
        <p className="text-xs text-white/50 mb-2 font-medium">
          {label ? (() => { try { return format(parseISO(label), 'MMM dd HH:mm') } catch { return label } })() : ''}
        </p>
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-6 mb-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: entry.color }} />
              <span className="text-xs text-white/60">{entry.name}</span>
            </div>
            <span className="text-xs font-bold text-white mono-num">
              {entry.name.includes('%')
                ? `${(entry.value * 100).toFixed(1)}%`
                : `$${entry.value.toLocaleString()}`}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function VaRTrendChart({
  data,
  title = 'Value at Risk Trend',
}: VaRTrendChartProps) {
  const formatXAxis = (ts: string) => {
    try {
      return format(parseISO(ts), 'HH:mm')
    } catch {
      return ts
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.1 }}
      className="glass-card p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-white">{title}</h3>
          <p className="text-xs text-white/40 mt-0.5">
            {data.length} data points — dual axis visualization
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-indigo-400 rounded" />
            <span className="text-white/50">VaR 95%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-purple-400 rounded" />
            <span className="text-white/50">VaR 99%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 bg-warning rounded" style={{ borderTop: '2px dashed #f59e0b' }} />
            <span className="text-white/50">Risk %</span>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 40, left: 10, bottom: 0 }}>
          <defs>
            <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.04)"
            vertical={false}
          />
          <XAxis
            dataKey="timestamp"
            tickFormatter={formatXAxis}
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          {/* Left Y axis — VaR values */}
          <YAxis
            yAxisId="var"
            orientation="left"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`}
          />
          {/* Right Y axis — risk probability */}
          <YAxis
            yAxisId="risk"
            orientation="right"
            domain={[0, 1]}
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Risk probability shaded area */}
          <Area
            yAxisId="risk"
            type="monotone"
            dataKey="risk_probability"
            name="Risk %"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 3"
            fill="url(#riskGrad)"
            dot={false}
            animationDuration={1400}
          />

          {/* VaR 95% line */}
          <Line
            yAxisId="var"
            type="monotone"
            dataKey="var_95"
            name="VaR 95%"
            stroke="#818cf8"
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: '#818cf8', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={1200}
          />

          {/* VaR 99% line */}
          <Line
            yAxisId="var"
            type="monotone"
            dataKey="var_99"
            name="VaR 99%"
            stroke="#a78bfa"
            strokeWidth={2.5}
            strokeDasharray="6 2"
            dot={false}
            activeDot={{ r: 4, fill: '#a78bfa', stroke: '#fff', strokeWidth: 2 }}
            animationDuration={1200}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  )
}
