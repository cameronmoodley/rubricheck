import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole } from "../auth/auth";
import { getTemplatePdfBase64 } from "../data/rubric-templates";

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/rubric-templates - List templates
// Query: ?subjectId=xxx - filter by subject (only templates assigned to that subject)
// Admin: can list all templates without subjectId
// Teacher: when subjectId provided, returns templates assigned to that subject
router.get(
  "/",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const subjectId = req.query.subjectId as string | undefined;
      const userRole = req.user?.role;

      if (subjectId) {
        // Return only templates assigned to this subject
        const assignments = await prisma.subjectRubricTemplate.findMany({
          where: { subject_id: subjectId },
        });
        const templateIds = assignments.map((a) => a.template_id);
        const templatesList =
          templateIds.length > 0
            ? await prisma.rubricTemplate.findMany({
                where: { id: { in: templateIds } },
              })
            : [];
        const templateMap = new Map(templatesList.map((t) => [t.id, t]));
        const templates = templateIds
          .map((id) => templateMap.get(id))
          .filter(Boolean)
          .map((t) => ({
            id: t!.id,
            name: t!.name,
            description: t!.description,
            criteria: t!.criteria,
          }));
        return res.json({ templates });
      }

      // No subjectId: Admin sees all templates, Teacher sees all (for backwards compat when no mapping yet)
      if (userRole !== "ADMIN") {
        return res.json({ templates: [] });
      }
      const all = await prisma.rubricTemplate.findMany({
        orderBy: { name: "asc" },
      });
      return res.json({
        templates: all.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          criteria: t.criteria,
        })),
      });
    } catch (err: unknown) {
      console.error("rubric-templates list error:", err);
      res.status(500).json({ error: "Failed to list templates" });
    }
  }
);

// Helper: teacher can only access subjects in their classes
async function teacherCanAccessSubject(userId: string, subjectId: string): Promise<boolean> {
  const classSubject = await prisma.classSubject.findFirst({
    where: {
      subject_id: subjectId,
      class: { teacher_id: userId },
    },
  });
  return !!classSubject;
}

// GET /api/rubric-templates/subjects/:subjectId/templates - Get templates assigned to a subject
// Teachers: only for subjects in their classes. Admin: any subject.
router.get(
  "/subjects/:subjectId/templates",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const subjectId = req.params.subjectId;
      if (!subjectId) {
        return res.status(400).json({ error: "Subject ID required" });
      }
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      if (userRole === "TEACHER" && userId && !(await teacherCanAccessSubject(userId, subjectId))) {
        return res.status(403).json({ error: "You can only manage templates for subjects you teach" });
      }

      const assignments = await prisma.subjectRubricTemplate.findMany({
        where: { subject_id: subjectId },
      });
      const templateIds = assignments.map((a) => a.template_id);
      const templatesList =
        templateIds.length > 0
          ? await prisma.rubricTemplate.findMany({
              where: { id: { in: templateIds } },
            })
          : [];
      const templateMap = new Map(templatesList.map((t) => [t.id, t]));
      return res.json({
        templateIds,
        templates: templateIds
          .map((id) => templateMap.get(id))
          .filter(Boolean)
          .map((t) => ({ id: t!.id, name: t!.name, description: t!.description })),
      });
    } catch (err: unknown) {
      console.error("subject templates error:", err);
      res.status(500).json({ error: "Failed to get subject templates" });
    }
  }
);

// PUT /api/rubric-templates/subjects/:subjectId/templates - Assign templates to a subject
// Teachers: only for subjects in their classes. Admin: any subject.
router.put(
  "/subjects/:subjectId/templates",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const subjectId = req.params.subjectId;
      if (!subjectId) {
        return res.status(400).json({ error: "Subject ID required" });
      }
      const { templateIds } = req.body as { templateIds?: string[] };
      if (!Array.isArray(templateIds)) {
        return res.status(400).json({ error: "templateIds must be an array" });
      }

      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
      });
      if (!subject) {
        return res.status(404).json({ error: "Subject not found" });
      }

      const userRole = req.user?.role;
      const userId = req.user?.userId;
      if (userRole === "TEACHER" && userId && !(await teacherCanAccessSubject(userId, subjectId))) {
        return res.status(403).json({ error: "You can only assign templates to subjects you teach" });
      }

      await prisma.subjectRubricTemplate.deleteMany({
        where: { subject_id: subjectId },
      });

      if (templateIds.length > 0) {
        await prisma.subjectRubricTemplate.createMany({
          data: templateIds.map((template_id) => ({
            subject_id: subjectId,
            template_id,
          })),
          skipDuplicates: true,
        });
      }

      return res.json({
        success: true,
        message: `Assigned ${templateIds.length} template(s) to subject`,
      });
    } catch (err: unknown) {
      console.error("assign templates error:", err);
      res.status(500).json({ error: "Failed to assign templates" });
    }
  }
);

// GET /api/rubric-templates/all - List ALL templates (for create/assign UI)
// Teachers and Admin can list all templates.
router.get(
  "/all",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const all = await prisma.rubricTemplate.findMany({
        orderBy: { name: "asc" },
      });
      return res.json({
        templates: all.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          criteria: t.criteria,
        })),
      });
    } catch (err: unknown) {
      console.error("rubric-templates all error:", err);
      res.status(500).json({ error: "Failed to list templates" });
    }
  }
);

// POST /api/rubric-templates - Create a new template (Teachers and Admin)
router.post(
  "/",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { name, description, criteria } = req.body as {
        name?: string;
        description?: string;
        criteria?: Record<string, { maxScore: number; description: string }>;
      };
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Template name is required" });
      }
      const criteriaData = criteria && typeof criteria === "object" ? criteria : {};
      const template = await prisma.rubricTemplate.create({
        data: {
          name: name.trim(),
          description: description && typeof description === "string" ? description.trim() : null,
          criteria: criteriaData,
        },
      });
      return res.status(201).json({
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          criteria: template.criteria,
        },
      });
    } catch (err: unknown) {
      console.error("rubric-templates create error:", err);
      res.status(500).json({ error: "Failed to create template" });
    }
  }
);

// GET /api/rubric-templates/:id/subjects - Get subjects this template is assigned to
router.get(
  "/:id/subjects",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const templateId = req.params.id;
      if (!templateId) {
        return res.status(400).json({ error: "Template ID required" });
      }
      const assignments = await prisma.subjectRubricTemplate.findMany({
        where: { template_id: templateId },
        include: { subject: true },
      });
      return res.json({
        subjectIds: assignments.map((a) => a.subject_id),
        subjects: assignments.map((a) => ({ id: a.subject.id, name: a.subject.name, code: a.subject.code })),
      });
    } catch (err: unknown) {
      console.error("template subjects error:", err);
      res.status(500).json({ error: "Failed to get template subjects" });
    }
  }
);

// GET /api/rubric-templates/:id - Get a single template (for editing)
router.get(
  "/:id",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: "Template ID required" });
      }
      const template = await prisma.rubricTemplate.findUnique({
        where: { id },
      });
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      return res.json({
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          criteria: template.criteria,
        },
      });
    } catch (err: unknown) {
      console.error("rubric-templates get error:", err);
      res.status(500).json({ error: "Failed to get template" });
    }
  }
);

// PUT /api/rubric-templates/:id - Update a template (Teachers and Admin)
router.put(
  "/:id",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: "Template ID required" });
      }
      const { name, description, criteria } = req.body as {
        name?: string;
        description?: string;
        criteria?: Record<string, { maxScore: number; description: string }>;
      };
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "Template name is required" });
      }
      const criteriaData = criteria && typeof criteria === "object" ? criteria : {};
      const template = await prisma.rubricTemplate.update({
        where: { id },
        data: {
          name: name.trim(),
          description: description && typeof description === "string" ? description.trim() : null,
          criteria: criteriaData,
        },
      });
      return res.json({
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          criteria: template.criteria,
        },
      });
    } catch (err: unknown) {
      console.error("rubric-templates update error:", err);
      res.status(500).json({ error: "Failed to update template" });
    }
  }
);

// DELETE /api/rubric-templates/:id - Delete a template (Teachers and Admin)
router.delete(
  "/:id",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: "Template ID required" });
      }
      const template = await prisma.rubricTemplate.findUnique({
        where: { id },
      });
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      await prisma.rubricTemplate.delete({
        where: { id },
      });
      return res.json({ success: true, message: `Template "${template.name}" deleted` });
    } catch (err: unknown) {
      console.error("rubric-templates delete error:", err);
      res.status(500).json({ error: "Failed to delete template" });
    }
  }
);

// GET /api/rubric-templates/:id/file - Get template PDF for download/use
router.get(
  "/:id/file",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        return res.status(400).json({ error: "Template ID required" });
      }
      const template = await prisma.rubricTemplate.findUnique({
        where: { id },
      });
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      const pdfBuffer = Buffer.from(getTemplatePdfBase64(), "base64");
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="rubric-template-${template.name}.pdf"`
      );
      res.send(pdfBuffer);
    } catch (err: unknown) {
      console.error("rubric-templates file error:", err);
      res.status(500).json({ error: "Failed to get template file" });
    }
  }
);

export default router;
