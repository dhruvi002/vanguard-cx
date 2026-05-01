import 'dotenv/config';
import axios from 'axios';
import { processTicket } from './agents/graph.js';
import type { Ticket, TraceStep } from './types.js';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '5000');

async function postTraceSteps(ticketId: string, steps: TraceStep[]) {
  for (const step of steps) {
    try {
      await axios.post(`${BACKEND_URL}/api/tickets/${ticketId}/trace`, step, {
        timeout: 3000,
      });
    } catch {
      // Non-fatal — backend may be processing independently
    }
  }
}

async function updateTicketStatus(ticketId: string, status: string, resolution: string) {
  try {
    await axios.patch(`${BACKEND_URL}/api/tickets/${ticketId}`, { status, resolution }, {
      timeout: 3000,
    });
  } catch {
    // Non-fatal
  }
}

async function fetchPendingTickets(): Promise<Ticket[]> {
  try {
    const res = await axios.get(`${BACKEND_URL}/api/tickets?status=pending&limit=5`, {
      timeout: 3000,
    });
    return res.data || [];
  } catch {
    return [];
  }
}

const processing = new Set<string>();

async function processLoop() {
  const tickets = await fetchPendingTickets();

  for (const ticket of tickets) {
    if (processing.has(ticket.id)) continue;
    processing.add(ticket.id);

    console.log(`[worker] processing ${ticket.id}: ${ticket.subject}`);

    processTicket(ticket)
      .then(async ({ steps, resolution, status }) => {
        await postTraceSteps(ticket.id, steps);
        await updateTicketStatus(ticket.id, status, resolution);
        console.log(`[worker] ${ticket.id} → ${status}`);
      })
      .catch(err => {
        console.error(`[worker] error processing ${ticket.id}:`, err.message);
      })
      .finally(() => {
        processing.delete(ticket.id);
      });
  }
}

async function main() {
  console.log(`Vanguard-CX Agent Worker starting...`);
  console.log(`Backend: ${BACKEND_URL}`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Initial run
  await processLoop();

  // Continuous polling
  setInterval(processLoop, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
