import { create } from 'zustand'
import type { Ticket, TraceStep, Metrics, EvalRun } from '../types'

interface Store {
  // Tickets
  tickets: Ticket[]
  setTickets: (t: Ticket[]) => void
  upsertTicket: (t: Ticket) => void

  // Active trace
  selectedTicketId: string | null
  setSelectedTicketId: (id: string | null) => void
  traceSteps: Record<string, TraceStep[]>
  addTraceStep: (ticketId: string, step: TraceStep) => void
  setTraceSteps: (ticketId: string, steps: TraceStep[]) => void

  // Metrics
  metrics: Metrics | null
  setMetrics: (m: Metrics) => void

  // Eval
  evalRun: EvalRun | null
  setEvalRun: (e: EvalRun) => void
  evalProgress: number
  setEvalProgress: (p: number) => void

  // UI
  filter: string
  setFilter: (f: string) => void
  sidebarOpen: boolean
  setSidebarOpen: (o: boolean) => void
}

export const useStore = create<Store>((set) => ({
  tickets: [],
  setTickets: (tickets) => set({ tickets }),
  upsertTicket: (ticket) =>
    set((s) => {
      const idx = s.tickets.findIndex((t) => t.id === ticket.id)
      if (idx >= 0) {
        const next = [...s.tickets]
        next[idx] = ticket
        return { tickets: next }
      }
      return { tickets: [ticket, ...s.tickets].slice(0, 200) }
    }),

  selectedTicketId: null,
  setSelectedTicketId: (id) => set({ selectedTicketId: id }),
  traceSteps: {},
  addTraceStep: (ticketId, step) =>
    set((s) => ({
      traceSteps: {
        ...s.traceSteps,
        [ticketId]: [...(s.traceSteps[ticketId] ?? []), step].sort(
          (a, b) => a.step_index - b.step_index
        ),
      },
    })),
  setTraceSteps: (ticketId, steps) =>
    set((s) => ({ traceSteps: { ...s.traceSteps, [ticketId]: steps } })),

  metrics: null,
  setMetrics: (metrics) => set({ metrics }),

  evalRun: null,
  setEvalRun: (evalRun) => set({ evalRun }),
  evalProgress: 0,
  setEvalProgress: (evalProgress) => set({ evalProgress }),

  filter: 'all',
  setFilter: (filter) => set({ filter }),
  sidebarOpen: true,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}))
