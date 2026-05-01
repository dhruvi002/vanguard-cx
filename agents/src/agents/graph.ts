import { StateGraph, END, START, Annotation } from '@langchain/langgraph';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ToolMessage } from '@langchain/core/messages';
import { ALL_TOOLS, TOOL_MAP } from '../tools/index.js';
import { SYSTEM_PROMPT_MAP, CLASSIFIER_PROMPT } from '../prompts/system.js';
import type { Ticket, TraceStep, ToolResult, TicketCategory, TicketStatus } from '../types.js';
import { randomUUID } from 'crypto';

// ── State Definition ──────────────────────────────────────────────────────────

const AgentStateAnnotation = Annotation.Root({
  ticket: Annotation<Ticket>({ reducer: (_, b) => b }),
  steps: Annotation<TraceStep[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  category: Annotation<TicketCategory>({ reducer: (_, b) => b, default: () => 'general' }),
  agentId: Annotation<string>({ reducer: (_, b) => b, default: () => 'general-agent' }),
  customerContext: Annotation<Record<string, unknown>>({ reducer: (_, b) => b, default: () => ({}) }),
  toolResults: Annotation<ToolResult[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  messages: Annotation<(HumanMessage | SystemMessage | AIMessage | ToolMessage)[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  resolution: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  status: Annotation<TicketStatus>({ reducer: (_, b) => b, default: () => 'pending' }),
  iteration: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  shouldEscalate: Annotation<boolean>({ reducer: (_, b) => b, default: () => false }),
  error: Annotation<string | undefined>({ reducer: (_, b) => b, default: () => undefined }),
});

type AgentState = typeof AgentStateAnnotation.State;

// ── LLM Setup ────────────────────────────────────────────────────────────────

function getLLM(tools?: typeof ALL_TOOLS) {
  const llm = new ChatOpenAI({
    model: 'gpt-4o-mini',
    temperature: 0,
    apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
  });
  if (tools && tools.length > 0) {
    return llm.bindTools(tools);
  }
  return llm;
}

// ── Helper: build a TraceStep ─────────────────────────────────────────────────

function makeStep(
  ticketId: string,
  index: number,
  type: TraceStep['type'],
  title: string,
  detail: string,
  toolName = '',
  toolInput = '',
  toolOutput = '',
  durationMs = 0,
): TraceStep {
  return {
    id: randomUUID(),
    ticket_id: ticketId,
    step_index: index,
    type,
    title,
    detail,
    tool_name: toolName,
    tool_input: toolInput,
    tool_output: toolOutput,
    duration_ms: durationMs,
    created_at: new Date().toISOString(),
  };
}

// ── Node: Classify Intent ─────────────────────────────────────────────────────

async function classifyNode(state: AgentState): Promise<Partial<AgentState>> {
  const start = Date.now();
  const llm = getLLM();

  const response = await llm.invoke([
    new SystemMessage(CLASSIFIER_PROMPT),
    new HumanMessage(
      `Classify this support ticket:\nSubject: ${state.ticket.subject}\nBody: ${state.ticket.body}\n\nRespond with JSON: {"category":"...", "confidence":0.0, "agent":"...", "reasoning":"..."}`
    ),
  ]);

  let category: TicketCategory = 'general';
  let agentId = 'general-agent';
  let confidence = 0.85;
  let reasoning = '';

  try {
    const text = response.content.toString();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      category = parsed.category || 'general';
      agentId = parsed.agent || 'general-agent';
      confidence = parsed.confidence || 0.85;
      reasoning = parsed.reasoning || '';
    }
  } catch {
    // Fall back to keyword classification
    const text = (state.ticket.subject + ' ' + state.ticket.body).toLowerCase();
    if (/order|ship|deliver|track|package/.test(text)) { category = 'shipping'; agentId = 'order-agent'; }
    else if (/charge|bill|refund|payment|duplicate/.test(text)) { category = 'billing'; agentId = 'billing-agent'; }
    else if (/password|login|locked|account|access/.test(text)) { category = 'auth'; agentId = 'auth-agent'; }
    else if (/return|wrong item|exchange/.test(text)) { category = 'returns'; agentId = 'returns-agent'; }
  }

  const elapsed = Date.now() - start;
  const step = makeStep(
    state.ticket.id, state.steps.length, 'think',
    'Classify intent',
    `Category: ${category} | Agent: ${agentId} | Confidence: ${confidence.toFixed(2)}\n${reasoning}`,
    'classifier',
    JSON.stringify({ text: state.ticket.subject }),
    JSON.stringify({ category, agent: agentId, confidence }),
    elapsed,
  );

  return {
    category,
    agentId,
    status: 'active',
    steps: [step],
    messages: [new AIMessage(response.content.toString())],
  };
}

// ── Node: Fetch Customer Context ──────────────────────────────────────────────

async function fetchContextNode(state: AgentState): Promise<Partial<AgentState>> {
  const start = Date.now();
  // Simulate DB lookup — in production this calls the Go backend
  const customerContext: Record<string, unknown> = {
    customer_id: state.ticket.customer_id,
    email: state.ticket.customer_email,
    name: 'Customer',
    plan: 'pro',
    account_locked: false,
  };

  const elapsed = Date.now() - start + 25; // simulate latency
  const step = makeStep(
    state.ticket.id, state.steps.length, 'db',
    'Fetch customer context',
    `Customer: ${customerContext.email} | Plan: ${customerContext.plan} | Locked: ${customerContext.account_locked}`,
    'sql:users_db',
    JSON.stringify({ email: state.ticket.customer_email }),
    JSON.stringify(customerContext),
    elapsed,
  );

  return { customerContext, steps: [step] };
}

// ── Node: Agent Reasoning (ReAct loop) ───────────────────────────────────────

async function agentReasonNode(state: AgentState): Promise<Partial<AgentState>> {
  const systemPrompt = SYSTEM_PROMPT_MAP[state.agentId] || SYSTEM_PROMPT_MAP['general-agent'];
  const llm = getLLM(ALL_TOOLS);

  const contextMsg = `
Customer: ${state.ticket.customer_email}
Plan: ${state.customerContext.plan || 'unknown'}
Ticket ID: ${state.ticket.id}
Subject: ${state.ticket.subject}
Body: ${state.ticket.body}

Resolve this ticket step by step using the available tools. Be thorough.
`.trim();

  const messages = [
    new SystemMessage(systemPrompt),
    new HumanMessage(contextMsg),
    ...state.messages.filter(m => m instanceof AIMessage || m instanceof ToolMessage),
  ];

  const response = await llm.invoke(messages);
  const newSteps: TraceStep[] = [];

  // Record this reasoning step
  const thinkContent = typeof response.content === 'string'
    ? response.content
    : (response.content as Array<{ text?: string }>).map((b) => b.text || '').join('');

  if (thinkContent.trim()) {
    newSteps.push(makeStep(
      state.ticket.id, state.steps.length + newSteps.length, 'think',
      'Agent reasoning',
      thinkContent.slice(0, 500),
    ));
  }

  // Process any tool calls in the response
  const toolResults: ToolResult[] = [];
  const newMessages: (AIMessage | ToolMessage)[] = [new AIMessage(response)];

  if (response.tool_calls && response.tool_calls.length > 0) {
    for (const toolCall of response.tool_calls) {
      const toolFn = TOOL_MAP[toolCall.name];
      if (!toolFn) continue;

      const toolStart = Date.now();
      let output = '';
      let success = true;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        output = await (toolFn as any).invoke(JSON.stringify(toolCall.args));
      } catch (err) {
        output = JSON.stringify({ error: String(err) });
        success = false;
      }

      const elapsed = Date.now() - toolStart;

      // Determine step type from tool name
      let stepType: TraceStep['type'] = 'tool';
      if (toolCall.name.startsWith('sql_')) stepType = 'db';
      else if (toolCall.name.includes('api')) stepType = 'api';
      if (!success) stepType = 'error';

      newSteps.push(makeStep(
        state.ticket.id,
        state.steps.length + newSteps.length,
        stepType,
        `Tool: ${toolCall.name}`,
        success
          ? `Input: ${JSON.stringify(toolCall.args).slice(0, 200)}\nOutput: ${output.slice(0, 300)}`
          : `Tool call failed: ${output}`,
        toolCall.name,
        JSON.stringify(toolCall.args),
        output,
        elapsed,
      ));

      toolResults.push({
        tool_name: toolCall.name,
        input: toolCall.args as Record<string, unknown>,
        output: JSON.parse(output),
        success,
        duration_ms: elapsed,
      });

      newMessages.push(new ToolMessage({
        tool_call_id: toolCall.id!,
        content: output,
      }));
    }
  }

  return {
    steps: newSteps,
    toolResults,
    messages: newMessages,
    iteration: state.iteration + 1,
  };
}

// ── Node: Synthesize Resolution ───────────────────────────────────────────────

async function resolveNode(state: AgentState): Promise<Partial<AgentState>> {
  const llm = getLLM();

  const toolSummary = state.toolResults
    .map(r => `${r.tool_name}: ${JSON.stringify(r.output).slice(0, 200)}`)
    .join('\n');

  const response = await llm.invoke([
    new SystemMessage(`You are a CX resolution writer. Based on tool results, write a clear, empathetic resolution message for the customer. Be specific and mention what actions were taken.`),
    new HumanMessage(
      `Ticket: ${state.ticket.subject}\n\nTool results:\n${toolSummary}\n\nWrite a 2-3 sentence resolution summary for internal records.`
    ),
  ]);

  const resolution = response.content.toString();
  const hasError = state.toolResults.some(r => !r.success);

  const step = makeStep(
    state.ticket.id, state.steps.length, 'output',
    'Resolution dispatched',
    resolution,
  );

  return {
    resolution,
    status: hasError && state.toolResults.filter(r => !r.success).length > 2
      ? 'failed'
      : 'resolved',
    steps: [step],
  };
}

// ── Edge: should we keep reasoning or resolve? ────────────────────────────────

function shouldContinue(state: AgentState): 'reason' | 'resolve' | 'escalate' {
  if (state.shouldEscalate) return 'escalate';
  if (state.iteration >= 4) return 'resolve'; // max iterations
  // Continue if last AI message had tool calls
  const lastAI = [...state.messages].reverse().find(m => m instanceof AIMessage);
  if (lastAI && (lastAI as AIMessage).tool_calls && (lastAI as AIMessage).tool_calls!.length > 0) {
    return 'reason';
  }
  return 'resolve';
}

async function escalateNode(state: AgentState): Promise<Partial<AgentState>> {
  const step = makeStep(
    state.ticket.id, state.steps.length, 'error',
    'Escalated to human',
    'Agent could not resolve autonomously. Full context packaged for human review.',
  );
  return {
    status: 'escalated',
    resolution: 'Escalated to human support agent with full context.',
    steps: [step],
  };
}

// ── Build the Graph ───────────────────────────────────────────────────────────

export function buildAgentGraph() {
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('classify', classifyNode)
    .addNode('fetchContext', fetchContextNode)
    .addNode('reason', agentReasonNode)
    .addNode('resolve', resolveNode)
    .addNode('escalate', escalateNode)
    .addEdge(START, 'classify')
    .addEdge('classify', 'fetchContext')
    .addEdge('fetchContext', 'reason')
    .addConditionalEdges('reason', shouldContinue, {
      reason: 'reason',
      resolve: 'resolve',
      escalate: 'escalate',
    })
    .addEdge('resolve', END)
    .addEdge('escalate', END);

  return graph.compile();
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function processTicket(ticket: Ticket): Promise<{
  steps: TraceStep[];
  resolution: string;
  status: TicketStatus;
  toolResults: ToolResult[];
}> {
  const app = buildAgentGraph();

  const finalState = await app.invoke({
    ticket,
    steps: [],
    messages: [],
    toolResults: [],
    iteration: 0,
    shouldEscalate: false,
  });

  return {
    steps: finalState.steps,
    resolution: finalState.resolution,
    status: finalState.status,
    toolResults: finalState.toolResults,
  };
}
