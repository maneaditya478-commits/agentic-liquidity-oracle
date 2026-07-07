import { motion } from 'framer-motion'
import { useState } from 'react'
import clsx from 'clsx'

interface HeatmapCell {
  day: number
  hour: number
  value: number
}

interface HeatmapChartProps {
  data: HeatmapCell[]
  title?: string
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const HOURS = Array.from({ length: 24 }, (_, i) => i)

function getColor(value: number): string {
  // value 0–1
  if (value < 0.2) return 'rgba(34,197,94,0.7)'
  if (value < 0.4) return 'rgba(134,239,172,0.7)'
  if (value < 0.55) return 'rgba(253,224,71,0.7)'
  if (value < 0.7) return 'rgba(245,158,11,0.8)'
  if (value < 0.85) return 'rgba(239,68,68,0.85)'
  return 'rgba(220,38,38,0.95)'
}

function getTextColor(value: number): string {
  return value > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.7)'
}

function formatHour(h: number): string {
  if (h === 0) return '12A'
  if (h === 12) return '12P'
  if (h < 12) return `${h}A`
  return `${h - 12}P`
}

export default function HeatmapChart({
  data,
  title = 'Market Volatility Heatmap',
}: HeatmapChartProps) {
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    day: string
    hour: number
    value: number
  } | null>(null)

  // Build lookup
  const lookup: Record<string, number> = {}
  data.forEach((c) => {
    lookup[`${c.day}-${c.hour}`] = c.value
  })

  const cellW = 28
  const cellH = 22
  const padL = 36
  const padT = 28
  const gap = 2

  const svgW = padL + HOURS.length * (cellW + gap)
  const svgH = padT + DAYS.length * (cellH + gap) + 20

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2 }}
      className="glass-card p-6 relative"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-white">{title}</h3>
          <p className="text-xs text-white/40 mt-0.5">7 days × 24 hours — live volatility grid</p>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/40">Low</span>
          <div className="flex gap-0.5">
            {[0.1, 0.3, 0.5, 0.7, 0.9].map((v, i) => (
              <div
                key={i}
                className="w-5 h-3 rounded-sm"
                style={{ background: getColor(v) }}
              />
            ))}
          </div>
          <span className="text-[10px] text-white/40">High</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <svg width={svgW} height={svgH} className="select-none">
          {/* Hour labels */}
          {HOURS.map((h, hi) => (
            <text
              key={h}
              x={padL + hi * (cellW + gap) + cellW / 2}
              y={14}
              textAnchor="middle"
              fill="rgba(255,255,255,0.3)"
              fontSize={8}
              fontFamily="Inter, sans-serif"
            >
              {hi % 3 === 0 ? formatHour(h) : ''}
            </text>
          ))}

          {/* Day labels */}
          {DAYS.map((day, di) => (
            <text
              key={day}
              x={padL - 6}
              y={padT + di * (cellH + gap) + cellH / 2 + 1}
              textAnchor="end"
              dominantBaseline="middle"
              fill="rgba(255,255,255,0.4)"
              fontSize={10}
              fontFamily="Inter, sans-serif"
              fontWeight={500}
            >
              {day}
            </text>
          ))}

          {/* Heatmap cells */}
          {DAYS.map((day, di) =>
            HOURS.map((h, hi) => {
              const val = lookup[`${di}-${h}`] ?? 0
              const x = padL + hi * (cellW + gap)
              const y = padT + di * (cellH + gap)
              return (
                <motion.rect
                  key={`${di}-${h}`}
                  x={x}
                  y={y}
                  width={cellW}
                  height={cellH}
                  rx={3}
                  fill={getColor(val)}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{
                    delay: (di * 24 + hi) * 0.002,
                    duration: 0.3,
                  }}
                  className="cursor-pointer"
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGRectElement).getBoundingClientRect()
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top - 8,
                      day,
                      hour: h,
                      value: val,
                    })
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              )
            })
          )}

          {/* Axis lines */}
          <line
            x1={padL}
            y1={padT - 4}
            x2={padL}
            y2={svgH - 20}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
          <line
            x1={padL}
            y1={padT - 4}
            x2={svgW}
            y2={padT - 4}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        </svg>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 glass-card px-3 py-2 pointer-events-none text-xs"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="font-semibold text-white">
            {tooltip.day} {formatHour(tooltip.hour)}:00
          </p>
          <p className="text-white/60">
            Volatility:{' '}
            <span className="text-white font-bold mono-num">
              {(tooltip.value * 100).toFixed(1)}%
            </span>
          </p>
        </div>
      )}
    </motion.div>
  )
}
