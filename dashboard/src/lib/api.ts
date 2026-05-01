import type { Ticket, TraceStep, Metrics, EvalRun } from '../types'

const BASE = (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ?? ''

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

export const api = {
  tickets: {
    list: (status?: string, limit = 50) =>
      get<Ticket[]>(`/api/tickets?status=${status ?? ''}&limit=${limit}`),
    get: (id: string) => get<Ticket>(`/api/tickets/${id}`),
    create: (data: { subject: string; body: string; customer_email: string; priority?: number }) =>
      post<Ticket>('/api/tickets', data),
    trace: (id: string) => get<TraceStep[]>(`/api/tickets/${id}/trace`),
  },
  metrics: {
    get: () => get<Metrics>('/api/metrics'),
  },
  eval: {
    latest: () => get<EvalRun>('/api/eval/latest'),
    trigger: () => post<{ run_id: string; status: string }>('/api/eval/run'),
  },
}
