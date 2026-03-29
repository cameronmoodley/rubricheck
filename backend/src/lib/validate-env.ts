import { logger } from "./logger";

const required = [
  "JWT_SECRET",
  "DATABASE_URL",
] as const;

const optionalButWarn = [
  "N8N_PAPER_WEBHOOK_URL",
  "N8N_EXAM_PROJECTS_WEBHOOK_URL",
  "N8N_MOODLE_WEB_HOOK",
  "RESEND_API_KEY",
  "APP_URL",
] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  for (const key of required) {
    if (!process.env[key] || process.env[key]!.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    logger.fatal({ missing }, "Missing required environment variables");
    process.exit(1);
  }

  for (const key of optionalButWarn) {
    if (!process.env[key] || process.env[key]!.trim() === "") {
      logger.warn({ key }, "Optional env var not set - some features may not work");
    }
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    logger.warn("JWT_SECRET should be at least 32 characters for production");
  }

  logger.info("Environment validation passed");
}
