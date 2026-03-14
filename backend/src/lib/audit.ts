import { PrismaClient } from "@prisma/client";
import { logger } from "./logger";

const prisma = new PrismaClient();

export interface AuditLogEntry {
  userId?: string | undefined;
  action: string;
  resource: string;
  resourceId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  ipAddress?: string | undefined;
}

export async function logAudit(entry: AuditLogEntry): Promise<void> {
  try {
    const data: Parameters<typeof prisma.auditLog.create>[0]["data"] = {
      action: entry.action,
      resource: entry.resource,
    };
    if (entry.userId) data.user_id = entry.userId;
    if (entry.resourceId) data.resource_id = entry.resourceId;
    if (entry.details != null) data.details = entry.details as object;
    if (entry.ipAddress) data.ip_address = entry.ipAddress;

    await prisma.auditLog.create({ data });
  } catch (err) {
    logger.error({ err, entry }, "Failed to write audit log");
  }
}

export function getClientIp(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]?.trim();
  if (Array.isArray(forwarded)) return forwarded[0]?.trim();
  return undefined;
}
