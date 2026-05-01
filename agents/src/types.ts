export type TicketCategory = 'shipping' | 'billing' | 'auth' | 'returns' | 'api' | 'general';
export type TicketStatus = 'pending' | 'active' | 'resolved' | 'failed' | 'escalated';
export type StepType = 'think' | 'tool' | 'db' | 'api' | 'output' | 'error';

export interface Ticket {
  id: string;
  subject: string;
  body: string;
  customer_id: string;
  customer_email: string;
  status: TicketStatus;
  category: TicketCategory;
  agent_id: string;
  priority: number;
  created_at: string;
}

export interface TraceStep {
  id: string;
  ticket_id: string;
  step_index: number;
  type: StepType;
  title: string;
  detail: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  duration_ms: number;
  created_at: string;
}

export interface ToolResult {
  tool_name: string;
  input: Record<string, unknown>;
  output: unknown;
  success: boolean;
  duration_ms: number;
  error?: string;
}

// LangGraph agent state
export interface AgentState {
  ticket: Ticket;
  steps: TraceStep[];
  category: TicketCategory;
  customerContext: Record<string, unknown>;
  orderContext: Record<string, unknown>;
  billingContext: Record<string, unknown>;
  toolResults: ToolResult[];
  resolution: string;
  status: TicketStatus;
  iteration: number;
  maxIterations: number;
  shouldEscalate: boolean;
  error?: string;
}

// DeepEval types
export interface EvalCase {
  id: string;
  category: TicketCategory | 'adversarial' | 'edge_case';
  ticket_subject: string;
  ticket_body: string;
  customer_email: string;
  expected_category: string;
  expected_tools: string[];
  expected_resolution_keywords: string[];
  should_escalate: boolean;
  adversarial_type?: 'prompt_injection' | 'hallucination_bait' | 'context_overflow' | 'ambiguous';
}

export interface EvalScore {
  case_id: string;
  faithfulness: number;
  answer_relevancy: number;
  hallucination: number;
  contextual_recall: number;
  tool_call_accuracy: number;
  passed: boolean;
  error?: string;
}
