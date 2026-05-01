import { useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { useStore } from '../../store'
import { StepNode, EmptyState, StatusBadge, CategoryBadge } from '../layout/Primitives'
import type { TraceStep } from '../../types'

function StepDetail({ step, isLast }: { step: TraceStep; isLast: boolean }) {
  let parsedInput: string | null = null
  let parsedOutput: string | null = null

  try {
    if (step.tool_input) {
      const obj = JSON.parse(step.tool_input)
      parsedInput = JSON.stringify(obj, null, 2)
    }
  } catch { parsedInput = step.tool_input ?? null }

  try {
    if (step.tool_output) {
      const obj = JSON.parse(step.tool_output)
      parsedOutput = JSON.stringify(obj, null, 2)
    }
  } catch { parsedOutput = step.tool_output ?? null }

  return (
    <div className="flex gap-3 trace-enter">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0">
        <StepNode type={step.type} />
        {!isLast && <div className="w-px flex-1 mt-1.5 min-h-[20px]" style={{ background: 'var(--border)' }} />}
      </div>

      {/* Content */}
      <div className={clsx('pb-5 flex-1 min-w-0', isLast && 'pb-1')}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold text-[var(--text-primary)]">{step.title}</span>
          {step.duration_ms > 0 && (
            <span className="mono text-[10px] text-[var(--text-muted)] ml-auto flex-shrink-0">{step.duration_ms}ms</span>
          )}
        </div>

        {/* Main detail */}
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap break-words mb-2">
          {step.detail}
        </p>

        {/* Tool name pill */}
        {step.tool_name && (
          <span className="mono text-[10px] px-2 py-0.5 rounded border inline-block mb-2"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
            {step.tool_name}
          </span>
        )}

        {/* Expandable I/O */}
        {(parsedInput || parsedOutput) && (
          <details className="mt-1 group">
            <summary className="text-[10px] text-[var(--text-muted)] cursor-pointer select-none hover:text-[var(--text-secondary)] list-none flex items-center gap-1">
              <span className="transition-transform group-open:rotate-90 inline-block">▶</span>
              Show I/O
            </summary>
            <div className="mt-2 rounded border overflow-hidden text-[11px]"
              style={{ borderColor: 'var(--border)' }}>
              {parsedInput && (
                <div>
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider border-b"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
                    Input
                  </div>
                  <pre className="px-3 py-2 overflow-x-auto mono text-[10px] leading-relaxed"
                    style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>
                    {parsedInput.slice(0, 600)}{parsedInput.length > 600 ? '\n…' : ''}
                  </pre>
                </div>
              )}
              {parsedOutput && (
                <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <div className="px-3 py-1 text-[10px] uppercase tracking-wider border-b"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--bg-secondary)' }}>
                    Output
                  </div>
                  <pre className="px-3 py-2 overflow-x-auto mono text-[10px] leading-relaxed"
                    style={{ background: 'var(--bg-primary)', color: 'var(--accent-green)' }}>
                    {parsedOutput.slice(0, 800)}{parsedOutput.length > 800 ? '\n…' : ''}
                  </pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  )
}

export function TracePanel() {
  const selectedId = useStore((s) => s.selectedTicketId)
  const tickets = useStore((s) => s.tickets)
  const traceSteps = useStore((s) => s.traceSteps)
  const bottomRef = useRef<HTMLDivElement>(null)

  const ticket = tickets.find((t) => t.id === selectedId)
  const steps = selectedId ? (traceSteps[selectedId] ?? []) : []

  // Auto-scroll to bottom as new steps stream in
  useEffect(() => {
    if (ticket?.status === 'active') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [steps.length, ticket?.status])

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0"
        style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Agent Thought Trace
        </span>
        {ticket && (
          <div className="flex items-center gap-2">
            <span className="mono text-[10px] text-[var(--text-muted)]">{ticket.id}</span>
            <CategoryBadge category={ticket.category} />
            <StatusBadge status={ticket.status} />
          </div>
        )}
      </div>

      {/* Trace content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedId ? (
          <EmptyState icon="🔍" message="Select a ticket to view its agent trace" />
        ) : steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-muted)]">
            {ticket?.status === 'active' ? (
              <>
                <div className="w-5 h-5 border-2 border-[var(--accent-blue)] border-t-transparent rounded-full spinner" />
                <span className="text-xs">Agent processing…</span>
              </>
            ) : (
              <EmptyState icon="📋" message="No trace steps available" />
            )}
          </div>
        ) : (
          <div className="p-4">
            {/* Ticket summary */}
            {ticket && (
              <div className="rounded border p-3 mb-5 text-xs"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">{ticket.subject}</div>
                {ticket.body && (
                  <div className="text-[var(--text-muted)] leading-relaxed line-clamp-2">{ticket.body}</div>
                )}
                <div className="flex gap-2 mt-2 text-[10px] text-[var(--text-muted)]">
                  <span>Customer: {ticket.customer_email}</span>
                  {ticket.resolution_ms && (
                    <span className="ml-auto">
                      Resolved in {ticket.resolution_ms < 1000
                        ? `${ticket.resolution_ms}ms`
                        : `${(ticket.resolution_ms / 1000).toFixed(2)}s`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Steps */}
            {steps.map((step, i) => (
              <StepDetail key={step.id} step={step} isLast={i === steps.length - 1} />
            ))}

            {/* Live streaming indicator */}
            {ticket?.status === 'active' && (
              <div className="flex items-center gap-2 mt-3 text-[var(--accent-blue)] text-xs">
                <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full spinner" />
                <span>Agent reasoning…</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </div>
    </div>
  )
}
