import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole } from "../auth/auth";

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/audit - Get audit logs (Admin only)
router.get(
  "/",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { action, resource, userId, limit = "100", offset = "0" } = req.query;

      const where: Record<string, unknown> = {};
      if (action) where.action = action;
      if (resource) where.resource = resource;
      if (userId) where.user_id = userId;

      const logs = await prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { email: true, name: true },
          },
        },
        orderBy: { created_at: "desc" },
        take: Math.min(parseInt(limit as string) || 100, 500),
        skip: parseInt(offset as string) || 0,
      });

      const total = await prisma.auditLog.count({ where });

      res.json({
        logs: logs.map((l) => ({
          id: l.id,
          userId: l.user_id,
          userEmail: l.user?.email,
          userName: l.user?.name,
          action: l.action,
          resource: l.resource,
          resourceId: l.resource_id,
          details: l.details,
          ipAddress: l.ip_address,
          createdAt: l.created_at,
        })),
        total,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch audit logs" });
    }
  }
);

export default router;
