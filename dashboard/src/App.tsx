import { useEffect } from 'react'
import { useStore } from './store'
import { useWebSocket } from './hooks/useWebSocket'
import { api } from './lib/api'
import { Navbar } from './components/layout/Navbar'
import { MetricsSection } from './components/dashboard/MetricsSection'
import { TicketList } from './components/dashboard/TicketList'
import { TracePanel } from './components/traces/TracePanel'
import { EvalPanel } from './components/eval/EvalPanel'
import type { Ticket, TraceStep, Metrics, EvalRun, WSMessage } from './types'

export default function App() {
  const setTickets    = useStore((s) => s.setTickets)
  const upsertTicket  = useStore((s) => s.upsertTicket)
  const addTraceStep  = useStore((s) => s.addTraceStep)
  const setMetrics    = useStore((s) => s.setMetrics)
  const setEvalRun    = useStore((s) => s.setEvalRun)
  const setEvalProgress = useStore((s) => s.setEvalProgress)

  // Initial data load
  useEffect(() => {
    api.tickets.list().then(setTickets).catch(console.warn)
    api.metrics.get().then(setMetrics).catch(console.warn)
    api.eval.latest().then(setEvalRun).catch(console.warn)

    // Poll metrics every 10s as fallback when WS is down
    const interval = setInterval(() => {
      api.metrics.get().then(setMetrics).catch(() => {})
    }, 10_000)
    return () => clearInterval(interval)
  }, [])

  // WebSocket real-time updates
  useWebSocket((msg: WSMessage) => {
    switch (msg.type) {
      case 'ticket_update':
        upsertTicket(msg.payload as Ticket)
        break
      case 'trace_step': {
        const { ticket_id, step } = msg.payload as { ticket_id: string; step: TraceStep }
        addTraceStep(ticket_id, step)
        break
      }
      case 'metrics':
        setMetrics(msg.payload as Metrics)
        break
      case 'eval_progress': {
        const p = msg.payload as { progress: number }
        setEvalProgress(p.progress)
        break
      }
      case 'eval_complete':
        setEvalRun(msg.payload as EvalRun)
        setEvalProgress(100)
        break
    }
  })

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Navbar />

      {/* Top: metrics strip */}
      <div className="flex-shrink-0 border-b" style={{ borderColor: 'var(--border)' }}>
        <MetricsSection />
      </div>

      {/* Bottom: three-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Col 1: Ticket list (fixed width) */}
        <div className="w-72 flex-shrink-0 overflow-hidden flex flex-col"
          style={{ background: 'var(--bg-secondary)' }}>
          <TicketList />
        </div>

        {/* Col 2: Trace viewer (flex-grow) */}
        <div className="flex-1 overflow-hidden flex flex-col"
          style={{ background: 'var(--bg-primary)' }}>
          <TracePanel />
        </div>

        {/* Col 3: Eval panel (fixed width) */}
        <div className="w-72 flex-shrink-0 overflow-hidden flex flex-col border-l"
          style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}>
          <EvalPanel />
        </div>
      </div>
    </div>
  )
}
