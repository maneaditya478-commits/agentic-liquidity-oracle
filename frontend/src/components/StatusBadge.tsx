import clsx from 'clsx'
import { motion } from 'framer-motion'
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  ZapOff,
  Zap,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react'

type StatusValue =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL'
  | 'LOCKED'
  | 'UNLOCKED'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'

interface StatusBadgeProps {
  status: StatusValue
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  pulse?: boolean
  className?: string
}

const statusConfig: Record<
  StatusValue,
  {
    label: string
    icon: React.ElementType
    bg: string
    text: string
    border: string
    glow?: string
  }
> = {
  LOW: {
    label: 'LOW RISK',
    icon: CheckCircle,
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
  },
  MEDIUM: {
    label: 'MEDIUM RISK',
    icon: AlertTriangle,
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/30',
  },
  HIGH: {
    label: 'HIGH RISK',
    icon: XCircle,
    bg: 'bg-danger/10',
    text: 'text-danger',
    border: 'border-danger/30',
  },
  CRITICAL: {
    label: 'CRITICAL',
    icon: ShieldAlert,
    bg: 'bg-critical/15',
    text: 'text-red-400',
    border: 'border-red-500/50',
    glow: 'pulse-glow-red',
  },
  LOCKED: {
    label: 'LOCKED',
    icon: ShieldCheck,
    bg: 'bg-danger/10',
    text: 'text-danger',
    border: 'border-danger/30',
    glow: 'pulse-glow-red',
  },
  UNLOCKED: {
    label: 'UNLOCKED',
    icon: ShieldOff,
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
  },
  PENDING: {
    label: 'PENDING',
    icon: Clock,
    bg: 'bg-warning/10',
    text: 'text-warning',
    border: 'border-warning/30',
  },
  SUCCESS: {
    label: 'SUCCESS',
    icon: Zap,
    bg: 'bg-success/10',
    text: 'text-success',
    border: 'border-success/30',
  },
  FAILED: {
    label: 'FAILED',
    icon: ZapOff,
    bg: 'bg-danger/10',
    text: 'text-danger',
    border: 'border-danger/30',
  },
}

const sizeConfig = {
  sm: { padding: 'px-2 py-0.5', text: 'text-[10px]', icon: 'w-3 h-3', gap: 'gap-1' },
  md: { padding: 'px-2.5 py-1', text: 'text-xs', icon: 'w-3.5 h-3.5', gap: 'gap-1.5' },
  lg: { padding: 'px-3.5 py-1.5', text: 'text-sm', icon: 'w-4 h-4', gap: 'gap-2' },
}

export default function StatusBadge({
  status,
  size = 'md',
  showIcon = true,
  pulse,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status]
  const sizes = sizeConfig[size]
  const shouldPulse = pulse ?? (status === 'CRITICAL' || status === 'LOCKED')
  const Icon = config.icon

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={clsx(
        'inline-flex items-center font-semibold tracking-widest rounded-full border',
        config.bg,
        config.text,
        config.border,
        sizes.padding,
        sizes.text,
        sizes.gap,
        shouldPulse && config.glow,
        className
      )}
    >
      {showIcon && <Icon className={clsx(sizes.icon, 'shrink-0')} />}
      {config.label}
    </motion.span>
  )
}
