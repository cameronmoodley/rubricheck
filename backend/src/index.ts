import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/upload";
import quizRoutes from "./routes/quiz";
import authRoutes from "./routes/auth";
import auditRoutes from "./routes/audit";
import rubricTemplatesRoutes from "./routes/rubric-templates";
import studentRoutes from "./routes/student";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole } from "./auth/auth";
import bcrypt from "bcryptjs";
import { validateEnv } from "./lib/validate-env";
import { logger } from "./lib/logger";
import { apiRateLimiter } from "./lib/rate-limit";
import { logAudit, getClientIp } from "./lib/audit";

const prisma = new PrismaClient();

// Load environment variables
dotenv.config();

// Ensure DATABASE_URL exists for Prisma (local dev fallback)
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5433/rubricheck?schema=public";
}

validateEnv();

const app = express();
const PORT = 8001;

// Enable CORS for all routes
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/api", apiRateLimiter);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", uploadRoutes);
app.use("/api/quiz", quizRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/rubric-templates", rubricTemplatesRoutes);
app.use("/api", studentRoutes);

// User management routes (Admin only)
app.get(
  "/api/users",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          created_at: true,
        },
        orderBy: {
          created_at: "desc",
        },
      });
      res.json({ users });
    } catch (error) {
      logger.error({ err: error }, "Error fetching users");
      res.status(500).json({ message: "Error fetching users" });
    }
  }
);

app.post(
  "/api/users/create",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { email, password, name, role } = req.body;

      if (!email || !password || !name || !role) {
        return res.status(400).json({ message: "All fields are required" });
      }

      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUser) {
        return res.status(400).json({ message: "User already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
        },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "CREATE",
        resource: "user",
        resourceId: user.id,
        details: { email: user.email, role: user.role },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.status(201).json({
        message: "User created successfully",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating user");
      res.status(500).json({ message: "Error creating user" });
    }
  }
);

app.delete(
  "/api/users/:id",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const userId = req.params.id;

      if (!userId) {
        return res.status(400).json({ message: "User ID is required" });
      }

      // Prevent admin from deleting themselves
      if (req.user?.userId === userId) {
        return res
          .status(400)
          .json({ message: "You cannot delete your own account" });
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Delete user
      await prisma.user.delete({
        where: { id: userId },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "DELETE",
        resource: "user",
        resourceId: userId,
        details: { deletedEmail: user.email },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.json({
        message: "User deleted successfully",
        userId: userId,
      });
    } catch (error) {
      logger.error({ err: error }, "Error deleting user");
      res.status(500).json({ message: "Error deleting user" });
    }
  }
);

// Class management routes (Admin/Teacher)
app.get(
  "/api/classes",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req, res) => {
    try {
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      // Build query based on role
      const whereClause: any = {};
      
      // If user is a TEACHER, only show classes they're assigned to
      if (userRole === "TEACHER" && userId) {
        whereClause.teacher_id = userId;
      }
      // If ADMIN, show all classes (no filter)

      const classes = await prisma.class.findMany({
        where: whereClause,
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          created_at: "desc",
        },
      });
      res.json({ classes });
    } catch (error) {
      logger.error({ err: error }, "Error fetching classes");
      res.status(500).json({ message: "Error fetching classes" });
    }
  }
);

// Get teachers list for dropdown
app.get(
  "/api/teachers",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req, res) => {
    try {
      const teachers = await prisma.user.findMany({
        where: {
          role: {
            in: ["TEACHER", "ADMIN"],
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: {
          name: "asc",
        },
      });
      res.json({ teachers });
    } catch (error) {
      logger.error({ err: error }, "Error fetching teachers");
      res.status(500).json({ message: "Error fetching teachers" });
    }
  }
);

app.post(
  "/api/classes/create",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { name, code, description, teacher_id } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Class name is required" });
      }

      // Check if class with same code exists
      if (code) {
        const existingClass = await prisma.class.findUnique({
          where: { code },
        });

        if (existingClass) {
          return res
            .status(400)
            .json({ message: "Class with this code already exists" });
        }
      }

      // Validate teacher_id if provided
      if (teacher_id) {
        const teacher = await prisma.user.findUnique({
          where: { id: teacher_id },
        });

        if (!teacher) {
          return res.status(400).json({ message: "Teacher not found" });
        }

        if (teacher.role !== "TEACHER" && teacher.role !== "ADMIN") {
          return res
            .status(400)
            .json({ message: "User must be a teacher or admin" });
        }
      }

      // Create class
      const newClass = await prisma.class.create({
        data: {
          name,
          code: code || null,
          description: description || null,
          teacher_id: teacher_id || null,
        },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "CREATE",
        resource: "class",
        resourceId: newClass.id,
        details: { name: newClass.name, code: newClass.code },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.status(201).json({
        message: "Class created successfully",
        class: newClass,
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating class");
      res.status(500).json({ message: "Error creating class" });
    }
  }
);

app.delete(
  "/api/classes/:id",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const classId = req.params.id;

      if (!classId) {
        return res.status(400).json({ message: "Class ID is required" });
      }

      // Check if class exists
      const classExists = await prisma.class.findUnique({
        where: { id: classId },
      });

      if (!classExists) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Delete class (cascade will handle class_subjects)
      await prisma.class.delete({
        where: { id: classId },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "DELETE",
        resource: "class",
        resourceId: classId,
        details: { name: classExists.name },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.json({
        message: "Class deleted successfully",
        classId: classId,
      });
    } catch (error) {
      logger.error({ err: error }, "Error deleting class");
      res.status(500).json({ message: "Error deleting class" });
    }
  }
);

// Subject management routes (ADMIN: all subjects, TEACHER: only subjects in their classes)
app.get(
  "/api/subjects",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req, res) => {
    try {
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      let subjects;
      if (userRole === "TEACHER" && userId) {
        const teacherClasses = await prisma.class.findMany({
          where: { teacher_id: userId },
          select: { id: true },
        });
        const classIds = teacherClasses.map((c) => c.id);
        const classSubjects = await prisma.classSubject.findMany({
          where: { class_id: { in: classIds } },
          include: { subject: true },
        });
        subjects = [...new Map(classSubjects.map((cs) => [cs.subject.id, cs.subject])).values()].sort(
          (a, b) => a.name.localeCompare(b.name)
        );
      } else {
        subjects = await prisma.subject.findMany({
          orderBy: { name: "asc" },
        });
      }
      res.json({ subjects });
    } catch (error) {
      logger.error({ err: error }, "Error fetching subjects");
      res.status(500).json({ message: "Error fetching subjects" });
    }
  }
);

app.post(
  "/api/subjects/create",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { name, code, classIds } = req.body;

      if (!name) {
        return res.status(400).json({ message: "Subject name is required" });
      }

      // Check if subject with same name exists
      const existingSubject = await prisma.subject.findUnique({
        where: { name },
      });

      if (existingSubject) {
        return res
          .status(400)
          .json({ message: "Subject with this name already exists" });
      }

      // Check if subject with same code exists (if code provided)
      if (code) {
        const existingCode = await prisma.subject.findUnique({
          where: { code },
        });

        if (existingCode) {
          return res
            .status(400)
            .json({ message: "Subject with this code already exists" });
        }
      }

      // Create subject
      const newSubject = await prisma.subject.create({
        data: {
          name,
          code: code || null,
        },
      });

      if (Array.isArray(classIds)) {
        const validIds = [...new Set(classIds.filter((id) => typeof id === "string" && id.trim()))];
        if (validIds.length > 0) {
          await prisma.classSubject.createMany({
            data: validIds.map((classId) => ({ class_id: classId, subject_id: newSubject.id })),
          });
        }
      }

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "CREATE",
        resource: "subject",
        resourceId: newSubject.id,
        details: { name: newSubject.name, code: newSubject.code },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.status(201).json({
        message: "Subject created successfully",
        subject: newSubject,
      });
    } catch (error) {
      logger.error({ err: error }, "Error creating subject");
      res.status(500).json({ message: "Error creating subject" });
    }
  }
);

app.delete(
  "/api/subjects/:id",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const subjectId = req.params.id;

      if (!subjectId) {
        return res.status(400).json({ message: "Subject ID is required" });
      }

      // Check if subject exists
      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
      });

      if (!subject) {
        return res.status(404).json({ message: "Subject not found" });
      }

      // Delete subject (cascade will handle class_subjects and papers)
      await prisma.subject.delete({
        where: { id: subjectId },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "DELETE",
        resource: "subject",
        resourceId: subjectId,
        details: { name: subject.name },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.json({
        message: "Subject deleted successfully",
        subjectId: subjectId,
      });
    } catch (error) {
      logger.error({ err: error }, "Error deleting subject");
      res.status(500).json({ message: "Error deleting subject" });
    }
  }
);

// GET /api/subjects/:id - Get single subject (Admin only)
app.get(
  "/api/subjects/:id",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const subjectId = req.params.id;
      if (!subjectId) return res.status(400).json({ message: "Subject ID is required" });

      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
      });
      if (!subject) return res.status(404).json({ message: "Subject not found" });

      res.json({ subject });
    } catch (error) {
      logger.error({ err: error }, "Error fetching subject");
      res.status(500).json({ message: "Error fetching subject" });
    }
  }
);

// GET /api/subjects/:id/classes - Get classes this subject is assigned to (Admin only)
app.get(
  "/api/subjects/:id/classes",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const subjectId = req.params.id;
      if (!subjectId) return res.status(400).json({ message: "Subject ID is required" });

      const classSubjects = await prisma.classSubject.findMany({
        where: { subject_id: subjectId },
        include: { class: true },
      });
      const classIds = classSubjects.map((cs) => cs.class.id);
      res.json({ classIds });
    } catch (error) {
      logger.error({ err: error }, "Error fetching subject classes");
      res.status(500).json({ message: "Error fetching subject classes" });
    }
  }
);

// PUT /api/subjects/:id - Update subject (Admin only)
app.put(
  "/api/subjects/:id",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const subjectId = req.params.id;
      const { name, code, classIds } = req.body;

      if (!subjectId) return res.status(400).json({ message: "Subject ID is required" });

      const subject = await prisma.subject.findUnique({
        where: { id: subjectId },
      });
      if (!subject) return res.status(404).json({ message: "Subject not found" });

      if (name !== undefined) {
        if (!name || !String(name).trim()) {
          return res.status(400).json({ message: "Subject name is required" });
        }
        const existingName = await prisma.subject.findFirst({
          where: { name: String(name).trim(), NOT: { id: subjectId } },
        });
        if (existingName) {
          return res.status(400).json({ message: "Subject with this name already exists" });
        }
      }

      if (code !== undefined && code !== null && code !== "") {
        const existingCode = await prisma.subject.findFirst({
          where: { code: String(code).trim(), NOT: { id: subjectId } },
        });
        if (existingCode) {
          return res.status(400).json({ message: "Subject with this code already exists" });
        }
      }

      const updateData: { name?: string; code?: string | null } = {};
      if (name !== undefined) updateData.name = String(name).trim();
      if (code !== undefined) updateData.code = code === "" || code === null ? null : String(code).trim();

      const updated = await prisma.subject.update({
        where: { id: subjectId },
        data: updateData,
      });

      if (Array.isArray(classIds)) {
        await prisma.classSubject.deleteMany({ where: { subject_id: subjectId } });
        const validIds = [...new Set(classIds.filter((id) => typeof id === "string" && id.trim()))];
        if (validIds.length > 0) {
          await prisma.classSubject.createMany({
            data: validIds.map((classId) => ({ class_id: classId, subject_id: subjectId })),
          });
        }
      }

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "UPDATE",
        resource: "subject",
        resourceId: subjectId,
        details: { name: updated.name, code: updated.code },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      res.json({ message: "Subject updated successfully", subject: updated });
    } catch (error) {
      logger.error({ err: error }, "Error updating subject");
      res.status(500).json({ message: "Error updating subject" });
    }
  }
);

// Get subjects for a specific class
app.get(
  "/api/classes/:classId/subjects",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req, res) => {
    try {
      const classId = req.params.classId;
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      if (!classId) {
        return res.status(400).json({ message: "Class ID is required" });
      }

      const classData = await prisma.class.findUnique({
        where: { id: classId },
      });

      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Teachers can only access subjects for classes they're assigned to
      if (userRole === "TEACHER" && classData.teacher_id !== userId) {
        return res.status(403).json({ message: "Access denied to this class" });
      }

      const classSubjects = await prisma.classSubject.findMany({
        where: { class_id: classId },
        include: {
          subject: true,
        },
        orderBy: {
          subject: {
            name: "asc",
          },
        },
      });

      const subjects = classSubjects.map((cs) => cs.subject);
      res.json({ subjects });
    } catch (error) {
      logger.error({ err: error }, "Error fetching class subjects");
      res.status(500).json({ message: "Error fetching class subjects" });
    }
  }
);

// Assign subjects to a class
app.post(
  "/api/classes/:classId/subjects",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const classId = req.params.classId;
      const { subject_ids } = req.body;

      if (!classId) {
        return res.status(400).json({ message: "Class ID is required" });
      }

      if (!subject_ids || !Array.isArray(subject_ids) || subject_ids.length === 0) {
        return res.status(400).json({ message: "Subject IDs array is required" });
      }

      // Check if class exists
      const classExists = await prisma.class.findUnique({
        where: { id: classId },
      });

      if (!classExists) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Create class-subject relationships (ignore duplicates)
      const createdAssignments = [];
      for (const subjectId of subject_ids) {
        try {
          const assignment = await prisma.classSubject.create({
            data: {
              class_id: classId,
              subject_id: subjectId,
            },
            include: {
              subject: true,
            },
          });
          createdAssignments.push(assignment);
        } catch (error: any) {
          // Ignore duplicate errors (unique constraint violation)
          if (error.code !== "P2002") {
            throw error;
          }
        }
      }

      res.status(201).json({
        message: `${createdAssignments.length} subject(s) assigned successfully`,
        assignments: createdAssignments,
      });
    } catch (error) {
      logger.error({ err: error }, "Error assigning subjects");
      res.status(500).json({ message: "Error assigning subjects" });
    }
  }
);

// Remove a subject from a class
app.delete(
  "/api/classes/:classId/subjects/:subjectId",
  authenticateToken,
  checkRole(["ADMIN"]),
  async (req, res) => {
    try {
      const { classId, subjectId } = req.params;

      if (!classId || !subjectId) {
        return res.status(400).json({ message: "Class ID and Subject ID are required" });
      }

      // Find the class-subject relationship
      const classSubject = await prisma.classSubject.findFirst({
        where: {
          class_id: classId,
          subject_id: subjectId,
        },
      });

      if (!classSubject) {
        return res.status(404).json({ message: "Subject not assigned to this class" });
      }

      // Delete the relationship
      await prisma.classSubject.delete({
        where: { id: classSubject.id },
      });

      res.json({
        message: "Subject removed from class successfully",
      });
    } catch (error) {
      logger.error({ err: error }, "Error removing subject from class");
      res.status(500).json({ message: "Error removing subject from class" });
    }
  }
);

// Class performance endpoint
app.get(
  "/api/classes/:classId/performance",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req, res) => {
    try {
      const classId = req.params.classId;
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      if (!classId) {
        return res.status(400).json({ message: "Class ID is required" });
      }

      // Verify class exists and user has access
      const classData = await prisma.class.findUnique({
        where: { id: classId },
      });

      if (!classData) {
        return res.status(404).json({ message: "Class not found" });
      }

      // Teachers can only access their own classes
      if (userRole === "TEACHER" && classData.teacher_id !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }

      // Get subjects for this class
      const classSubjects = await prisma.classSubject.findMany({
        where: { class_id: classId },
        include: {
          subject: true,
        },
      });

      const subjectIds = classSubjects.map((cs) => cs.subject_id);

      // Get all grades for papers in these subjects
      const grades = await prisma.grade.findMany({
        include: {
          tbl_papers: {
            select: {
              subject_id: true,
              tbl_subjects: {
                select: {
                  name: true,
                  code: true,
                },
              },
            },
          },
        },
        where: {
          tbl_papers: {
            subject_id: {
              in: subjectIds,
            },
          },
        },
      });

      // Calculate stats
      const totalPapersGraded = grades.length;
      const uniqueStudents = new Set(grades.map((g) => g.student_name)).size;
      const classAverage = grades.length > 0
        ? grades.reduce((sum, g) => sum + Number(g.total_score), 0) / grades.length
        : 0;

      // Papers graded this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const papersThisWeek = grades.filter((g) => g.created_at >= weekAgo).length;

      // Grade distribution
      const gradeDistribution = {
        A: grades.filter((g) => Number(g.total_score) >= 90).length,
        B: grades.filter((g) => Number(g.total_score) >= 80 && Number(g.total_score) < 90).length,
        C: grades.filter((g) => Number(g.total_score) >= 70 && Number(g.total_score) < 80).length,
        D: grades.filter((g) => Number(g.total_score) >= 60 && Number(g.total_score) < 70).length,
        F: grades.filter((g) => Number(g.total_score) < 60).length,
      };

      // Average by subject
      const subjectAverages = classSubjects.map((cs) => {
        const subjectGrades = grades.filter(
          (g) => g.tbl_papers.subject_id === cs.subject_id
        );
        const average = subjectGrades.length > 0
          ? subjectGrades.reduce((sum, g) => sum + Number(g.total_score), 0) / subjectGrades.length
          : 0;
        return {
          subject: cs.subject.name,
          average: Math.round(average * 100) / 100,
          count: subjectGrades.length,
        };
      });

      // Top 10 students by average
      const studentScores = new Map<string, number[]>();
      grades.forEach((g) => {
        const scores = studentScores.get(g.student_name) || [];
        scores.push(Number(g.total_score));
        studentScores.set(g.student_name, scores);
      });

      const topStudents = Array.from(studentScores.entries())
        .map(([name, scores]) => ({
          name,
          average: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100,
          paperCount: scores.length,
        }))
        .sort((a, b) => b.average - a.average)
        .slice(0, 10);

      // Grading activity over time (last 8 weeks)
      const activityData = [];
      for (let i = 7; i >= 0; i--) {
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - (i * 7));
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        const count = grades.filter(
          (g) => g.created_at >= weekStart && g.created_at < weekEnd
        ).length;

        activityData.push({
          week: `Week ${8 - i}`,
          count,
        });
      }

      res.json({
        stats: {
          totalPapersGraded,
          uniqueStudents,
          classAverage: Math.round(classAverage * 100) / 100,
          papersThisWeek,
        },
        gradeDistribution,
        subjectAverages,
        topStudents,
        activityData,
      });
    } catch (error) {
      logger.error({ err: error }, "Error fetching class performance");
      res.status(500).json({ message: "Error fetching class performance" });
    }
  }
);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "RubriCheck Backend is running",
    timestamp: new Date().toISOString(),
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(
    { port: PORT },
    `RubriCheck Backend running on port ${PORT}`
  );
  logger.info(`Upload: http://localhost:${PORT}/api/submissions`);
  logger.info(`Quiz: http://localhost:${PORT}/api/quiz`);
  logger.info(`Health: http://localhost:${PORT}/api/health`);
});
