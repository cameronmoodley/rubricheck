import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import uploadRoutes from "./routes/upload";
import quizRoutes from "./routes/quiz";
import authRoutes from "./routes/auth";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole } from "./auth/auth";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Load environment variables
dotenv.config();

// Ensure DATABASE_URL exists for Prisma
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://postgres:postgres@localhost:5433/rubricheck?schema=public";
}

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

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", uploadRoutes);
app.use("/api/quiz", quizRoutes);

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
      console.error("Error fetching users:", error);
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
      console.error("Error creating user:", error);
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

      res.json({
        message: "User deleted successfully",
        userId: userId,
      });
    } catch (error) {
      console.error("Error deleting user:", error);
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
      console.error("Error fetching classes:", error);
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
      console.error("Error fetching teachers:", error);
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

      res.status(201).json({
        message: "Class created successfully",
        class: newClass,
      });
    } catch (error) {
      console.error("Error creating class:", error);
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

      res.json({
        message: "Class deleted successfully",
        classId: classId,
      });
    } catch (error) {
      console.error("Error deleting class:", error);
      res.status(500).json({ message: "Error deleting class" });
    }
  }
);

// Subject management routes
app.get(
  "/api/subjects",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req, res) => {
    try {
      const subjects = await prisma.subject.findMany({
        orderBy: {
          name: "asc",
        },
      });
      res.json({ subjects });
    } catch (error) {
      console.error("Error fetching subjects:", error);
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
      const { name, code } = req.body;

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

      res.status(201).json({
        message: "Subject created successfully",
        subject: newSubject,
      });
    } catch (error) {
      console.error("Error creating subject:", error);
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

      res.json({
        message: "Subject deleted successfully",
        subjectId: subjectId,
      });
    } catch (error) {
      console.error("Error deleting subject:", error);
      res.status(500).json({ message: "Error deleting subject" });
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

      if (!classId) {
        return res.status(400).json({ message: "Class ID is required" });
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
      console.error("Error fetching class subjects:", error);
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
      console.error("Error assigning subjects:", error);
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
      console.error("Error removing subject from class:", error);
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
      console.error("Error fetching class performance:", error);
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
  console.log(`🚀 RubriCheck Backend running on port ${PORT}`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/submissions`);
  console.log(`📊 Quiz endpoint: http://localhost:${PORT}/api/quiz`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});
