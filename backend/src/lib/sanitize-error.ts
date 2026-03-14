/**
 * Sanitize error messages for user-facing API responses.
 * Never expose internal service names (n8n, webhook URLs, etc.) to the frontend.
 */
const INTERNAL_PATTERNS = [
  /n8n/i,
  /webhook/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
];

const USER_FRIENDLY_MESSAGE =
  "Grading service temporarily unavailable. Please try again later.";

export function sanitizeErrorMessage(
  message: string | undefined,
  fallback = "Something went wrong. Please try again."
): string {
  const msg = message?.trim() || fallback;
  const isInternal = INTERNAL_PATTERNS.some((p) => p.test(msg));
  return isInternal ? USER_FRIENDLY_MESSAGE : msg;
}
