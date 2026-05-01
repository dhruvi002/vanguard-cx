import { clsx } from 'clsx'
import type { TicketStatus, TicketCategory, StepType } from '../../types'

// ── Status Badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<TicketStatus, string> = {
  pending:   'bg-amber-500/10 text-amber-400 border border-amber-500/20',
  active:    'bg-blue-500/10  text-blue-400  border border-blue-500/20',
  resolved:  'bg-green-500/10 text-green-400 border border-green-500/20',
  failed:    'bg-red-500/10   text-red-400   border border-red-500/20',
  escalated: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
}

const STATUS_DOTS: Record<TicketStatus, string> = {
  pending:   'bg-amber-400',
  active:    'bg-blue-400 live-dot',
  resolved:  'bg-green-400',
  failed:    'bg-red-400',
  escalated: 'bg-purple-400',
}

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={clsx('badge gap-1', STATUS_STYLES[status])}>
      <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_DOTS[status])} />
      {status}
    </span>
  )
}

// ── Category Badge ────────────────────────────────────────────────────────────

const CAT_STYLES: Record<TicketCategory, string> = {
  shipping: 'bg-teal-500/10   text-teal-400',
  billing:  'bg-blue-500/10   text-blue-400',
  auth:     'bg-purple-500/10 text-purple-400',
  returns:  'bg-orange-500/10 text-orange-400',
  api:      'bg-pink-500/10   text-pink-400',
  general:  'bg-gray-500/10   text-gray-400',
}

const CAT_ICONS: Record<TicketCategory, string> = {
  shipping: '📦',
  billing:  '💳',
  auth:     '🔐',
  returns:  '↩️',
  api:      '⚡',
  general:  '💬',
}

export function CategoryBadge({ category }: { category: TicketCategory }) {
  return (
    <span className={clsx('badge gap-1', CAT_STYLES[category])}>
      <span className="text-xs leading-none">{CAT_ICONS[category]}</span>
      {category}
    </span>
  )
}

// ── Trace Step Node ───────────────────────────────────────────────────────────

const STEP_STYLES: Record<StepType, { bg: string; text: string; label: string }> = {
  think:  { bg: 'bg-blue-500/15',   text: 'text-blue-400',   label: '💭' },
  tool:   { bg: 'bg-teal-500/15',   text: 'text-teal-400',   label: '🔧' },
  db:     { bg: 'bg-amber-500/15',  text: 'text-amber-400',  label: 'DB' },
  api:    { bg: 'bg-pink-500/15',   text: 'text-pink-400',   label: 'API' },
  output: { bg: 'bg-green-500/15',  text: 'text-green-400',  label: '✓' },
  error:  { bg: 'bg-red-500/15',    text: 'text-red-400',    label: '✕' },
}

export function StepNode({ type }: { type: StepType }) {
  const s = STEP_STYLES[type]
  return (
    <div className={clsx('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold mono', s.bg, s.text)}>
      {s.label}
    </div>
  )
}

// ── Metric Card ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  color?: 'default' | 'green' | 'amber' | 'red' | 'blue'
  loading?: boolean
}

const METRIC_COLORS = {
  default: 'text-[var(--text-primary)]',
  green:   'text-[var(--accent-green)]',
  amber:   'text-[var(--accent-amber)]',
  red:     'text-[var(--accent-red)]',
  blue:    'text-[var(--accent-blue)]',
}

export function MetricCard({ label, value, sub, color = 'default', loading }: MetricCardProps) {
  return (
    <div className="card p-4">
      <div className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] mb-2 font-medium">{label}</div>
      {loading ? (
        <div className="h-7 w-20 rounded bg-[var(--border)] animate-pulse" />
      ) : (
        <div className={clsx('text-2xl font-semibold tabular-nums', METRIC_COLORS[color])}>{value}</div>
      )}
      {sub && <div className="text-[11px] text-[var(--text-muted)] mt-1">{sub}</div>}
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('rounded animate-pulse bg-[var(--border)]', className)} />
}

// ── Mini progress bar ─────────────────────────────────────────────────────────

export function ProgressBar({ value, color = '#58a6ff', className }: { value: number; color?: string; className?: string }) {
  return (
    <div className={clsx('h-1 rounded-full bg-[var(--border)]', className)}>
      <div
        className="h-full rounded-full transition-all duration-700"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
      />
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-muted)]">
      <span className="text-3xl">{icon}</span>
      <span className="text-xs">{message}</span>
    </div>
  )
}
