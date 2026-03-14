import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole } from "../auth/auth";

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/my-grades - Students see their own grades (matched by name)
router.get(
  "/my-grades",
  authenticateToken,
  checkRole(["STUDENT"]),
  async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { name: true, email: true },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const grades = await prisma.grade.findMany({
        where: {
          student_name: {
            in: [user.name, user.email],
          },
        },
        include: {
          tbl_papers: {
            include: {
              tbl_subjects: true,
            },
          },
        },
        orderBy: { created_at: "desc" },
      });

      const result = grades.map((g) => ({
        id: g.id,
        studentName: g.student_name,
        score: Number(g.total_score),
        goodComments: (g.criteria_scores as Record<string, unknown>)?.goodComments || "",
        badComments: (g.criteria_scores as Record<string, unknown>)?.badComments || "",
        gradedAt: g.created_at,
        paperFilename: g.tbl_papers.original_filename,
        subjectName: g.tbl_papers.tbl_subjects?.name || "Unknown",
        subjectCode: g.tbl_papers.tbl_subjects?.code,
      }));

      res.json({ grades: result });
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to fetch grades" });
    }
  }
);

export default router;
