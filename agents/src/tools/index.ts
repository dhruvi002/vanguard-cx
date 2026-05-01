import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import axios from 'axios';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8080';

// Helper to call the Go backend tool executor via REST
async function callBackendTool(toolName: string, input: Record<string, unknown>): Promise<unknown> {
  const start = Date.now();
  try {
    // Tools are simulated by the Go backend executor
    // In production, each tool would call real external services
    const response = await axios.post(`${BACKEND_URL}/api/tools/execute`, {
      tool: toolName,
      input,
    }, { timeout: 5000 });
    return response.data;
  } catch (err: unknown) {
    const elapsed = Date.now() - start;
    // Simulate tool execution locally if backend unavailable
    return simulateTool(toolName, input, elapsed);
  }
}

// Local simulation for development / testing without backend
function simulateTool(toolName: string, input: Record<string, unknown>, _elapsed: number): unknown {
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  switch (toolName) {
    case 'sql:orders_db':
      return {
        found: true,
        rows: [{
          order_id: input.order_id || 'ord_98432',
          status: 'in_transit',
          tracking_id: '1Z999AA10123456784',
          carrier: 'UPS',
          total_amount: 89.99,
          customer_email: input.customer_email || 'customer@example.com',
        }]
      };
    case 'sql:billing_db':
      return {
        charges: [
          { charge_id: 'ch_aaa111', amount: 49.99, status: 'succeeded', created_at: new Date().toISOString() },
          { charge_id: 'ch_aaa112', amount: 49.99, status: 'succeeded', created_at: new Date().toISOString() },
        ],
        duplicate_groups: [
          { charge_id: 'ch_aaa111', amount: 49.99 },
          { charge_id: 'ch_aaa112', amount: 49.99 },
        ],
        total_charges: 2,
      };
    case 'shipping_api.track':
      return {
        tracking_id: input.tracking_id,
        status: 'delayed',
        eta: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
        reason: 'weather_hold',
        last_scan: { location: 'Oakland CA', event: 'Package scanned at facility' },
      };
    case 'stripe_api.refund':
      return {
        refund_id: `re_${Math.random().toString(36).slice(2, 12)}`,
        amount: input.amount,
        status: 'succeeded',
      };
    case 'auth_api.send_reset':
      return {
        token: `tok_${Math.random().toString(36).slice(2, 14)}`,
        expires_in: 1800,
        sent_at: new Date().toISOString(),
      };
    default:
      return { error: `unknown tool: ${toolName}` };
  }
}

// --- LangGraph Tool Definitions ---

export const queryOrdersDB = tool(
  async ({ order_id, customer_id }) => {
    const result = await callBackendTool('sql:orders_db', { order_id, customer_id });
    return JSON.stringify(result);
  },
  {
    name: 'sql_orders_db',
    description: 'Query the orders database by order_id or customer_id. Returns order status, tracking info, items, and amounts.',
    schema: z.object({
      order_id: z.string().optional().describe('The order ID to look up (e.g. ord_98432)'),
      customer_id: z.string().optional().describe('The customer ID to fetch all orders for'),
    }),
  }
);

export const queryBillingDB = tool(
  async ({ customer_id }) => {
    const result = await callBackendTool('sql:billing_db', { customer_id });
    return JSON.stringify(result);
  },
  {
    name: 'sql_billing_db',
    description: 'Query the billing database for a customer. Returns charge history and detects duplicate charges.',
    schema: z.object({
      customer_id: z.string().describe('Customer ID to fetch billing records for'),
    }),
  }
);

export const queryUsersDB = tool(
  async ({ email, customer_id }) => {
    const result = await callBackendTool('sql:users_db', { email, customer_id });
    return JSON.stringify(result);
  },
  {
    name: 'sql_users_db',
    description: 'Look up customer account status, plan, and lock state by email or customer_id.',
    schema: z.object({
      email: z.string().optional().describe('Customer email address'),
      customer_id: z.string().optional().describe('Customer ID'),
    }),
  }
);

export const trackShipment = tool(
  async ({ tracking_id, carrier }) => {
    const result = await callBackendTool('shipping_api.track', { tracking_id, carrier });
    return JSON.stringify(result);
  },
  {
    name: 'shipping_api_track',
    description: 'Call the carrier shipping API to get live tracking status and ETA for a shipment.',
    schema: z.object({
      tracking_id: z.string().describe('The carrier tracking ID'),
      carrier: z.string().optional().describe('Carrier name (UPS, FedEx, USPS). Use "auto" to detect.'),
    }),
  }
);

export const createReturnLabel = tool(
  async ({ order_id, reason }) => {
    const result = await callBackendTool('shipping_api.create_return', { order_id, reason });
    return JSON.stringify(result);
  },
  {
    name: 'shipping_api_create_return',
    description: 'Generate a prepaid return shipping label for a given order. Use when customer reports wrong item or wants to return.',
    schema: z.object({
      order_id: z.string().describe('The order ID to create a return for'),
      reason: z.enum(['wrong_item', 'damaged', 'changed_mind', 'quality_issue']).describe('Return reason'),
    }),
  }
);

export const issueRefund = tool(
  async ({ charge_id, amount, reason }) => {
    const result = await callBackendTool('stripe_api.refund', { charge_id, amount, reason });
    return JSON.stringify(result);
  },
  {
    name: 'stripe_api_refund',
    description: 'Issue a refund via Stripe for a specific charge. Use for duplicate charges or billing errors.',
    schema: z.object({
      charge_id: z.string().describe('The Stripe charge ID to refund'),
      amount: z.number().describe('Amount to refund in dollars'),
      reason: z.enum(['duplicate', 'fraudulent', 'requested_by_customer']).describe('Refund reason'),
    }),
  }
);

export const sendPasswordReset = tool(
  async ({ email }) => {
    const result = await callBackendTool('auth_api.send_reset', { email });
    return JSON.stringify(result);
  },
  {
    name: 'auth_api_send_reset',
    description: 'Send a password reset email to the customer. Use for account access issues.',
    schema: z.object({
      email: z.string().email().describe('Customer email address to send reset link to'),
    }),
  }
);

export const unlockAccount = tool(
  async ({ customer_id }) => {
    const result = await callBackendTool('auth_api.unlock_account', { customer_id });
    return JSON.stringify(result);
  },
  {
    name: 'auth_api_unlock_account',
    description: 'Unlock a locked customer account so they can attempt login again.',
    schema: z.object({
      customer_id: z.string().describe('The customer ID to unlock'),
    }),
  }
);

// Tool registry for agent selection
export const ALL_TOOLS = [
  queryOrdersDB,
  queryBillingDB,
  queryUsersDB,
  trackShipment,
  createReturnLabel,
  issueRefund,
  sendPasswordReset,
  unlockAccount,
];

export const TOOL_MAP: Record<string, typeof ALL_TOOLS[number]> = {
  sql_orders_db: queryOrdersDB,
  sql_billing_db: queryBillingDB,
  sql_users_db: queryUsersDB,
  shipping_api_track: trackShipment,
  shipping_api_create_return: createReturnLabel,
  stripe_api_refund: issueRefund,
  auth_api_send_reset: sendPasswordReset,
  auth_api_unlock_account: unlockAccount,
};
