import { clsx } from 'clsx'
import { useStore } from '../../store'
import { StatusBadge, CategoryBadge, EmptyState } from '../layout/Primitives'
import type { TicketStatus } from '../../types'

const FILTERS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Resolved', value: 'resolved' },
  { label: 'Failed', value: 'failed' },
  { label: 'Escalated', value: 'escalated' },
]

export function TicketList() {
  const tickets = useStore((s) => s.tickets)
  const filter = useStore((s) => s.filter)
  const setFilter = useStore((s) => s.setFilter)
  const selectedId = useStore((s) => s.selectedTicketId)
  const setSelectedId = useStore((s) => s.setSelectedTicketId)
  const setTraceSteps = useStore((s) => s.setTraceSteps)
  const traceSteps = useStore((s) => s.traceSteps)

  const { api: apiClient } = { api: null } // we use store data directly

  const filtered = filter === 'all' ? tickets : tickets.filter((t) => t.status === filter)

  async function selectTicket(id: string) {
    setSelectedId(id)
    // Load trace if not already in store
    if (!traceSteps[id]) {
      try {
        const { api } = await import('../../lib/api')
        const steps = await api.tickets.trace(id)
        setTraceSteps(id, steps)
      } catch {/* noop */}
    }
  }

  return (
    <div className="flex flex-col h-full border-r" style={{ borderColor: 'var(--border)' }}>
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Tickets</span>
        <span className="text-xs text-[var(--text-muted)] tabular-nums">{filtered.length}</span>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 px-3 py-2 border-b flex-shrink-0 overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        {FILTERS.map((f) => {
          const count = f.value === 'all' ? tickets.length : tickets.filter((t) => t.status === f.value).length
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={clsx(
                'flex-shrink-0 rounded px-2.5 py-1 text-[11px] font-medium transition-colors',
                filter === f.value
                  ? 'bg-[var(--accent-blue)] text-black'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              )}
            >
              {f.label}
              {count > 0 && (
                <span className={clsx('ml-1 rounded px-1 text-[10px]',
                  filter === f.value ? 'bg-black/20' : 'bg-[var(--border)]'
                )}>{count}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Ticket rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyState icon="📭" message="No tickets match this filter" />
        ) : (
          filtered.map((ticket) => (
            <button
              key={ticket.id}
              onClick={() => selectTicket(ticket.id)}
              className={clsx(
                'w-full text-left px-4 py-3 border-b flex flex-col gap-1.5 transition-colors',
                'hover:bg-[var(--bg-card-hover)]',
                selectedId === ticket.id && 'bg-[var(--bg-card-hover)] border-l-2 border-l-[var(--accent-blue)]',
              )}
              style={{ borderColor: 'var(--border-light)' }}
            >
              {/* Row 1: ID + status */}
              <div className="flex items-center justify-between gap-2">
                <span className="mono text-[10px] text-[var(--text-muted)]">{ticket.id}</span>
                <StatusBadge status={ticket.status} />
              </div>

              {/* Row 2: Subject */}
              <div className="text-xs text-[var(--text-primary)] leading-snug line-clamp-2">
                {ticket.subject}
              </div>

              {/* Row 3: Category + agent + time */}
              <div className="flex items-center gap-2">
                <CategoryBadge category={ticket.category} />
                {ticket.agent_id && (
                  <span className="text-[10px] text-[var(--text-muted)]">{ticket.agent_id}</span>
                )}
                {ticket.resolution_ms && (
                  <span className="text-[10px] text-[var(--text-muted)] ml-auto tabular-nums">
                    {ticket.resolution_ms < 1000
                      ? `${ticket.resolution_ms}ms`
                      : `${(ticket.resolution_ms / 1000).toFixed(1)}s`}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
