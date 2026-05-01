export type TicketStatus = 'pending' | 'active' | 'resolved' | 'failed' | 'escalated'
export type TicketCategory = 'shipping' | 'billing' | 'auth' | 'returns' | 'api' | 'general'
export type StepType = 'think' | 'tool' | 'db' | 'api' | 'output' | 'error'

export interface Ticket {
  id: string
  subject: string
  body: string
  customer_id: string
  customer_email: string
  status: TicketStatus
  category: TicketCategory
  agent_id: string
  priority: number
  resolution_ms?: number
  created_at: string
  updated_at: string
  resolved_at?: string
}

export interface TraceStep {
  id: string
  ticket_id: string
  step_index: number
  type: StepType
  title: string
  detail: string
  tool_name?: string
  tool_input?: string
  tool_output?: string
  duration_ms: number
  created_at: string
}

export interface ToolStat {
  name: string
  calls_per_hr: number
  success_rate: number
  avg_ms: number
}

export interface ThroughputPoint {
  minute: string
  count: number
}

export interface Metrics {
  total_tickets: number
  resolved_today: number
  active_now: number
  success_rate: number
  avg_resolution_ms: number
  faithfulness_score: number
  throughput: ThroughputPoint[]
  tool_stats: ToolStat[]
}

export interface EvalRun {
  id: string
  total_cases: number
  passed: number
  failed: number
  success_rate: number
  avg_faithfulness: number
  avg_relevancy: number
  avg_hallucination: number
  duration_ms: number
  created_at: string
}

export interface WSMessage {
  type: 'ticket_update' | 'trace_step' | 'metrics' | 'eval_progress' | 'eval_complete'
  payload: unknown
}
