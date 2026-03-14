/**
 * Headers for outgoing requests to n8n webhooks.
 * Sends N8N_WEBHOOK_SECRET in the header named by N8N_WEBHOOK_HEADER (n8n webhook node Header Auth).
 */
export function getN8nRequestHeaders(): Record<string, string> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const headerName = process.env.N8N_WEBHOOK_HEADER || "X-Webhook-Secret";
  if (secret && headerName) {
    return { [headerName]: secret };
  }
  return {};
}
