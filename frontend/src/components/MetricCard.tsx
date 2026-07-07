import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect, useRef } from 'react'
import clsx from 'clsx'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface MetricCardProps {
  title: string
  value: number
  unit?: string
  prefix?: string
  change?: number
  changeDirection?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  color?: 'indigo' | 'success' | 'warning' | 'danger' | 'purple'
  description?: string
  format?: 'number' | 'currency' | 'percent' | 'compact'
  index?: number
}

const colorMap = {
  indigo: {
    icon: 'bg-indigo-500/15 text-indigo-400',
    border: 'border-indigo-500/20',
    glow: 'hover:shadow-indigo-500/10',
    accent: 'bg-indigo-500',
    gradient: 'from-indigo-500/10 to-transparent',
  },
  success: {
    icon: 'bg-success/15 text-success',
    border: 'border-success/20',
    glow: 'hover:shadow-success/10',
    accent: 'bg-success',
    gradient: 'from-success/10 to-transparent',
  },
  warning: {
    icon: 'bg-warning/15 text-warning',
    border: 'border-warning/20',
    glow: 'hover:shadow-warning/10',
    accent: 'bg-warning',
    gradient: 'from-warning/10 to-transparent',
  },
  danger: {
    icon: 'bg-danger/15 text-danger',
    border: 'border-danger/20',
    glow: 'hover:shadow-danger/10',
    accent: 'bg-danger',
    gradient: 'from-danger/10 to-transparent',
  },
  purple: {
    icon: 'bg-purple-500/15 text-purple-400',
    border: 'border-purple-500/20',
    glow: 'hover:shadow-purple-500/10',
    accent: 'bg-purple-500',
    gradient: 'from-purple-500/10 to-transparent',
  },
}

function formatValue(value: number, format: MetricCardProps['format'], prefix?: string, unit?: string): string {
  let formatted = ''
  switch (format) {
    case 'currency':
      formatted = `$${value >= 1_000_000 ? (value / 1_000_000).toFixed(1) + 'M' : value >= 1_000 ? (value / 1_000).toFixed(1) + 'K' : value.toFixed(2)}`
      break
    case 'percent':
      formatted = `${value.toFixed(1)}%`
      break
    case 'compact':
      formatted = value >= 1_000_000 ? `${(value / 1_000_000).toFixed(2)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : `${value.toFixed(0)}`
      break
    default:
      formatted = value.toFixed(2)
  }
  return `${prefix ?? ''}${formatted}${unit ? ' ' + unit : ''}`
}

function AnimatedCounter({
  value,
  format,
  prefix,
  unit,
}: {
  value: number
  format: MetricCardProps['format']
  prefix?: string
  unit?: string
}) {
  const motionVal = useMotionValue(0)
  const displayRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const controls = animate(motionVal, value, {
      duration: 1.2,
      ease: 'easeOut',
      onUpdate(v) {
        if (displayRef.current) {
          displayRef.current.textContent = formatValue(v, format, prefix, unit)
        }
      },
    })
    return controls.stop
  }, [value, format, prefix, unit, motionVal])

  return (
    <span ref={displayRef} className="mono-num">
      {formatValue(0, format, prefix, unit)}
    </span>
  )
}

export default function MetricCard({
  title,
  value,
  unit,
  prefix,
  change,
  changeDirection = 'neutral',
  icon: Icon,
  color = 'indigo',
  description,
  format = 'number',
  index = 0,
}: MetricCardProps) {
  const colors = colorMap[color]

  const TrendIcon =
    changeDirection === 'up'
      ? TrendingUp
      : changeDirection === 'down'
      ? TrendingDown
      : Minus

  const trendColor =
    changeDirection === 'up'
      ? 'text-success'
      : changeDirection === 'down'
      ? 'text-danger'
      : 'text-white/30'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={clsx(
        'glass-card relative overflow-hidden cursor-default group transition-all duration-300',
        'hover:border-white/14 hover:shadow-xl',
        colors.glow
      )}
    >
      {/* Accent gradient bar */}
      <div className={clsx('absolute top-0 left-0 right-0 h-px', colors.accent, 'opacity-60')} />

      {/* Background gradient */}
      <div
        className={clsx(
          'absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl opacity-20',
          `bg-gradient-to-br ${colors.gradient}`
        )}
      />

      <div className="relative p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className={clsx('p-2.5 rounded-xl', colors.icon)}>
            <Icon className="w-5 h-5" />
          </div>
          {change !== undefined && (
            <div className={clsx('flex items-center gap-1 text-xs font-semibold', trendColor)}>
              <TrendIcon className="w-3.5 h-3.5" />
              <span>{Math.abs(change).toFixed(1)}%</span>
            </div>
          )}
        </div>

        {/* Value */}
        <div className="mb-1">
          <p className="text-2xl font-bold text-white tracking-tight">
            <AnimatedCounter value={value} format={format} prefix={prefix} unit={unit} />
          </p>
        </div>

        {/* Title */}
        <p className="text-sm font-medium text-white/50">{title}</p>

        {/* Description */}
        {description && (
          <p className="text-xs text-white/30 mt-1.5 leading-relaxed">{description}</p>
        )}

        {/* Bottom progress bar */}
        <div className="mt-4 h-px bg-white/06">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min((value / 100) * 100, 100)}%` }}
            transition={{ duration: 1.5, delay: index * 0.1 + 0.3, ease: 'easeOut' }}
            className={clsx('h-full rounded-full', colors.accent)}
          />
        </div>
      </div>
    </motion.div>
  )
}
