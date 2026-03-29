/**
 * Headers for outgoing requests to n8n webhooks.
 * - N8N_WEBHOOK_SECRET → header for RubriCheck callback auth (n8n Webhook node can verify).
 * - N8N_BASIC_AUTH_* → when n8n has Basic Auth enabled, the reverse proxy may require it for /webhook too.
 */
export function getN8nRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const headerName = process.env.N8N_WEBHOOK_HEADER || "X-Webhook-Secret";
  if (secret && headerName) {
    headers[headerName] = secret;
  }
  const basicUser = process.env.N8N_BASIC_AUTH_USER;
  const basicPass = process.env.N8N_BASIC_AUTH_PASSWORD;
  if (basicUser && basicPass) {
    headers.Authorization =
      "Basic " + Buffer.from(`${basicUser}:${basicPass}`, "utf8").toString("base64");
  }
  return headers;
}
