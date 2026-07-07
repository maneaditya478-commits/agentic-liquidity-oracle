import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef } from 'react'
import clsx from 'clsx'

interface RiskGaugeProps {
  probability: number // 0–100
  size?: number
  label?: string
  showDetails?: boolean
}

function getRiskConfig(p: number) {
  if (p < 30) return { level: 'LOW', color: '#22c55e', glow: 'rgba(34,197,94,0.5)', textColor: 'text-success' }
  if (p < 60) return { level: 'MEDIUM', color: '#f59e0b', glow: 'rgba(245,158,11,0.5)', textColor: 'text-warning' }
  if (p < 80) return { level: 'HIGH', color: '#ef4444', glow: 'rgba(239,68,68,0.5)', textColor: 'text-danger' }
  return { level: 'CRITICAL', color: '#dc2626', glow: 'rgba(220,38,38,0.7)', textColor: 'text-red-400' }
}

// Build a conic arc path for the gauge
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(toRad(startAngle))
  const y1 = cy + r * Math.sin(toRad(startAngle))
  const x2 = cx + r * Math.cos(toRad(endAngle))
  const y2 = cy + r * Math.sin(toRad(endAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`
}

export default function RiskGauge({
  probability,
  size = 220,
  label,
  showDetails = true,
}: RiskGaugeProps) {
  const clamped = Math.max(0, Math.min(100, probability))
  const config = getRiskConfig(clamped)
  const isCritical = clamped >= 80

  const cx = size / 2
  const cy = size / 2 + 20
  const r = (size / 2) * 0.72
  const strokeWidth = 12

  // Arc from 210° to 330° (240° span)
  const startDeg = 210
  const totalSpan = 240
  const endDeg = startDeg + (clamped / 100) * totalSpan

  // Motion value for animated arc
  const motionVal = useMotionValue(0)
  const svgRef = useRef<SVGPathElement>(null)

  useEffect(() => {
    const controls = animate(motionVal, clamped, {
      duration: 1.5,
      ease: 'easeOut',
      onUpdate(v) {
        if (svgRef.current) {
          const deg = startDeg + (v / 100) * totalSpan
          svgRef.current.setAttribute('d', describeArc(cx, cy, r, startDeg, deg))
        }
      },
    })
    return controls.stop
  }, [clamped, cx, cy, r, motionVal])

  // Zone markers
  const zones = [
    { pct: 0, label: '0%', deg: 210 },
    { pct: 30, label: '30', deg: 210 + 0.3 * 240 },
    { pct: 60, label: '60', deg: 210 + 0.6 * 240 },
    { pct: 80, label: '80', deg: 210 + 0.8 * 240 },
    { pct: 100, label: '100%', deg: 210 + 240 },
  ]

  function markerPos(deg: number, dist = r + 22) {
    const rad = (deg * Math.PI) / 180
    return { x: cx + dist * Math.cos(rad), y: cy + dist * Math.sin(rad) }
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="flex flex-col items-center"
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="overflow-visible">
          <defs>
            <filter id="gauge-glow">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="arc-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="40%" stopColor="#f59e0b" />
              <stop offset="70%" stopColor="#ef4444" />
              <stop offset="100%" stopColor="#dc2626" />
            </linearGradient>
          </defs>

          {/* Background track */}
          <path
            d={describeArc(cx, cy, r, 210, 450)}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />

          {/* Zone segments (background) */}
          {[
            { from: 210, to: 210 + 0.3 * 240, color: 'rgba(34,197,94,0.15)' },
            { from: 210 + 0.3 * 240, to: 210 + 0.6 * 240, color: 'rgba(245,158,11,0.15)' },
            { from: 210 + 0.6 * 240, to: 210 + 0.8 * 240, color: 'rgba(239,68,68,0.15)' },
            { from: 210 + 0.8 * 240, to: 450, color: 'rgba(220,38,38,0.2)' },
          ].map((zone, i) => (
            <path
              key={i}
              d={describeArc(cx, cy, r, zone.from, zone.to)}
              fill="none"
              stroke={zone.color}
              strokeWidth={strokeWidth}
            />
          ))}

          {/* Animated filled arc */}
          <path
            ref={svgRef}
            d={describeArc(cx, cy, r, 210, 210)}
            fill="none"
            stroke={config.color}
            strokeWidth={strokeWidth + 2}
            strokeLinecap="round"
            filter="url(#gauge-glow)"
            style={{ transition: 'none' }}
          />

          {/* Needle dot */}
          {(() => {
            const needleDeg = startDeg + (clamped / 100) * totalSpan
            const nx = cx + r * Math.cos((needleDeg * Math.PI) / 180)
            const ny = cy + r * Math.sin((needleDeg * Math.PI) / 180)
            return (
              <motion.circle
                cx={nx}
                cy={ny}
                r={7}
                fill={config.color}
                stroke="rgba(5,9,20,1)"
                strokeWidth={3}
                filter="url(#gauge-glow)"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.2, duration: 0.3 }}
              />
            )
          })()}

          {/* Zone tick marks */}
          {zones.map(({ deg, label: zLabel }, i) => {
            const inner = markerPos(deg, r - strokeWidth / 2 - 6)
            const outer = markerPos(deg, r + strokeWidth / 2 + 6)
            const txt = markerPos(deg, r + strokeWidth / 2 + 20)
            return (
              <g key={i}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1.5}
                />
                <text
                  x={txt.x}
                  y={txt.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="rgba(255,255,255,0.35)"
                  fontSize={9}
                  fontFamily="Inter, sans-serif"
                  fontWeight={500}
                >
                  {zLabel}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Center display */}
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ paddingTop: 24 }}
        >
          <motion.div
            key={clamped}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.8 }}
            className="text-center"
          >
            <div
              className={clsx(
                'text-4xl font-bold mono-num mb-0.5',
                config.textColor,
                isCritical && 'animate-pulse'
              )}
            >
              {clamped.toFixed(1)}%
            </div>
            <div
              className={clsx(
                'text-xs font-bold tracking-widest uppercase',
                config.textColor,
                'opacity-80'
              )}
            >
              {config.level}
            </div>
            {label && (
              <div className="text-[10px] text-white/30 mt-1 font-medium">{label}</div>
            )}
          </motion.div>
        </div>

        {/* Critical pulse ring */}
        {isCritical && (
          <div
            className="absolute inset-0 rounded-full pulse-glow-red pointer-events-none"
            style={{ borderRadius: '50%' }}
          />
        )}
      </div>

      {showDetails && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0 }}
          className="flex gap-4 mt-2"
        >
          {[
            { label: 'Safe', color: 'bg-success', range: '0–30%' },
            { label: 'Medium', color: 'bg-warning', range: '30–60%' },
            { label: 'High', color: 'bg-danger', range: '60–80%' },
            { label: 'Critical', color: 'bg-critical', range: '80–100%' },
          ].map((z) => (
            <div key={z.label} className="flex items-center gap-1.5">
              <div className={clsx('w-2 h-2 rounded-full', z.color)} />
              <span className="text-[10px] text-white/40">{z.label}</span>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
