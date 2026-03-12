import express, { Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import { randomUUID } from "crypto";
import FormData from "form-data";
import fetch from "node-fetch";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole } from "../auth/auth";

const router = express.Router();
const prisma = new PrismaClient();

// n8n webhook URLs from env
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_EXAM_PROJECTS_WEBHOOK_URL =
  process.env.N8N_EXAM_PROJECTS_WEBHOOK_URL;

// In-memory storage for file buffers (cleaned up when submission completes)
// Key: submission_id, Value: { rubricBuffer, questionBuffer?, paperBuffers: Map<paperId, buffer> }
const fileBufferCache = new Map<
  string,
  {
    rubricBuffer: Buffer;
    questionBuffer?: Buffer;
    paperBuffers: Map<string, Buffer>;
  }
>();

// Multer memory storage config - files stored in memory instead of disk
const storage = multer.memoryStorage();

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"));
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Exam projects upload with different field structure
const examProjectsUpload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit
  },
});

// Helper function to append buffer to FormData
function appendBufferToFormData(
  formData: FormData,
  fieldName: string,
  buffer: Buffer,
  filename: string,
  mimeType?: string
) {
  formData.append(fieldName, buffer, {
    filename: filename,
    contentType: mimeType || "application/pdf",
  });
}

// Clean up file buffers for a completed submission
function cleanupSubmissionBuffers(submissionId: string) {
  fileBufferCache.delete(submissionId);
  console.log(`[cleanup] Removed file buffers for submission: ${submissionId}`);
}

// POST /api/submissions - Upload papers for grading
router.post(
  "/submissions",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  upload.fields([
    { name: "rubricFile", maxCount: 1 },
    { name: "paperFiles", maxCount: 5 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const rubricFile = files.rubricFile?.[0];
      const paperFiles = files.paperFiles || [];
      const { subjectName, subjectCode, uploadType, classId, subjectId: bodySubjectId } = req.body;

      if (!rubricFile) {
        return res.status(400).json({ error: "Rubric file is required" });
      }

      if (!paperFiles || paperFiles.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one paper file is required" });
      }

      console.log(
        `[upload] Processing ${paperFiles.length} papers with rubric: ${rubricFile.originalname}`
      );

      // Handle subject (prioritize new classId/subjectId approach, fallback to old subjectName approach)
      let subjectId = bodySubjectId || null;
      
      if (!subjectId && (subjectName || subjectCode)) {
        // Legacy support: create/find subject by name/code
        const existingSubject = await prisma.subject.findFirst({
          where: {
            OR: [
              subjectName ? { name: subjectName } : {},
              subjectCode ? { code: subjectCode } : {},
            ],
          },
        });

        if (existingSubject) {
          subjectId = existingSubject.id;
        } else {
          const newSubject = await prisma.subject.create({
            data: {
              name: subjectName || "Unknown Subject",
              code: subjectCode || null,
            },
          });
          subjectId = newSubject.id;
        }
      }
      
      // Verify class and subject assignment if classId provided
      if (classId && subjectId) {
        const classSubject = await prisma.classSubject.findFirst({
          where: {
            class_id: classId,
            subject_id: subjectId,
          },
        });
        
        if (!classSubject) {
          return res.status(400).json({ 
            error: "Subject is not assigned to the selected class" 
          });
        }
        
        console.log(`[upload] Verified subject ${subjectId} is assigned to class ${classId}`);
      }

      // Get subject name for rubric title
      let subjectNameForTitle = subjectName || "Unknown Subject";
      if (subjectId) {
        const subject = await prisma.subject.findUnique({
          where: { id: subjectId },
        });
        if (subject) {
          subjectNameForTitle = subject.name;
        }
      }

      // Create a dummy rubric first (required by schema)
      const rubric = await prisma.rubric.create({
        data: {
          title: `Rubric for ${subjectNameForTitle}`,
          criteria: {},
        },
      });

      // Create submission
      const submission = await prisma.submission.create({
        data: {
          id: randomUUID(),
          rubric_id: rubric.id,
          status: "PENDING",
        },
      });

      // Validate buffers exist (memory storage)
      if (!rubricFile.buffer) {
        throw new Error("Rubric file buffer is missing");
      }

      // Store file buffers in memory cache for sequential processing
      const paperBuffers = new Map<string, Buffer>();
      const papers = [];

      for (let i = 0; i < paperFiles.length; i++) {
        const paperFile = paperFiles[i];
        if (!paperFile) continue;

        if (!paperFile.buffer) {
          throw new Error(
            `Paper file buffer is missing for: ${paperFile.originalname}`
          );
        }

        const paper = await prisma.paper.create({
          data: {
            id: randomUUID(),
            submission_id: submission.id,
            student_name: `Student ${i + 1}`, // Default name, will be updated by n8n
            original_filename: paperFile.originalname,
            storage_path: "", // No longer storing files on disk
            mime_type: paperFile.mimetype,
            subject_id: subjectId,
          },
        });

        // Store buffer keyed by paper ID for sequential processing
        paperBuffers.set(paper.id, paperFile.buffer);
        papers.push(paper);
      }

      // Cache buffers for sequential processing
      fileBufferCache.set(submission.id, {
        rubricBuffer: rubricFile.buffer,
        paperBuffers: paperBuffers,
      });

      // Store upload type for sequential processing (no longer storing paths)
      await prisma.$queryRawUnsafe(
        `
      INSERT INTO tbl_submission_meta (submission_id, rubric_path, upload_type)
      VALUES ($1::uuid, $2, $3)
      ON CONFLICT (submission_id) DO UPDATE SET 
        rubric_path = EXCLUDED.rubric_path,
        upload_type = EXCLUDED.upload_type
    `,
        submission.id,
        "", // No longer storing file paths
        uploadType || "papers"
      );

      // Send first paper to n8n for grading
      const firstPaper = papers[0];
      if (!firstPaper) {
        throw new Error("No papers to process");
      }

      const firstPaperBuffer = paperBuffers.get(firstPaper.id);
      if (!firstPaperBuffer) {
        throw new Error("First paper buffer not found");
      }

      const formData = new FormData();
      appendBufferToFormData(
        formData,
        "rubricFile",
        rubricFile.buffer,
        rubricFile.originalname,
        rubricFile.mimetype
      );
      appendBufferToFormData(
        formData,
        "paperFile",
        firstPaperBuffer,
        firstPaper.original_filename || "paper.pdf",
        firstPaper.mime_type || "application/pdf"
      );

      // Send metadata as separate form fields
      formData.append("dbSubmissionId", submission.id);
      formData.append("dbPaperId", firstPaper.id);
      formData.append("originalFilename", firstPaper.original_filename);
      if (subjectName) formData.append("subjectName", subjectName);
      if (subjectCode) formData.append("subjectCode", subjectCode);

      // Choose webhook URL based on upload type
      const webhookUrl =
        uploadType === "exam-projects"
          ? N8N_EXAM_PROJECTS_WEBHOOK_URL
          : N8N_WEBHOOK_URL;

      if (!webhookUrl) {
        const key =
          uploadType === "exam-projects"
            ? "N8N_EXAM_PROJECTS_WEBHOOK_URL"
            : "N8N_WEBHOOK_URL";
        throw new Error(`Missing ${key} in environment`);
      }

      console.log(
        `[upload] Sending first ${
          uploadType === "exam-projects" ? "exam project" : "paper"
        } to n8n: ${firstPaper.original_filename}`
      );

      const n8nResponse = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      });

      if (!n8nResponse.ok) {
        throw new Error(`n8n request failed: ${n8nResponse.statusText}`);
      }

      const n8nResult = await n8nResponse.text();
      console.log(`[upload] n8n response: ${n8nResult}`);

      res.json({
        success: true,
        submissionId: submission.id,
        papers: papers.map((paper) => ({
          id: paper.id,
          filename: paper.original_filename,
        })),
        message: `Successfully uploaded ${papers.length} papers. First paper sent for grading.`,
      });
    } catch (error: any) {
      console.error("[upload] Error:", error);
      res.status(500).json({ error: error.message || "Upload failed" });
    }
  }
);

// POST /api/n8n/grades - Callback from n8n for paper grading results
router.post("/n8n/grades", async (req: Request, res: Response) => {
  try {
    console.log("[n8n-grades] Received grading results from n8n");
    console.log(
      "[n8n-grades] Request body:",
      JSON.stringify(req.body, null, 2)
    );

    let grades = [];
    if (Array.isArray(req.body)) {
      grades = req.body;
    } else if (req.body.grades && Array.isArray(req.body.grades)) {
      grades = req.body.grades;
    } else if (req.body.body && Array.isArray(req.body.body)) {
      grades = req.body.body;
    } else if (req.body.studentName) {
      grades = [req.body];
    } else {
      return res.status(400).json({ error: "Invalid payload format" });
    }

    console.log(`[n8n-grades] Processing ${grades.length} grade(s)`);

    for (const grade of grades) {
      const {
        studentName,
        paperToken,
        paperId,
        dbPaperId,
        originalFilename,
        submissionId,
        dbSubmissionId,
        score,
        goodComments,
        badComments,
      } = grade;

      console.log(
        `[n8n-grades] Processing grade for: ${studentName}, score: ${score}`
      );

      // Find paper using multiple strategies
      let paper = null;

      // Strategy 1: Use paperId/dbPaperId if provided
      if (paperId || dbPaperId) {
        paper = await prisma.paper.findUnique({
          where: { id: dbPaperId || paperId },
        });
        console.log(
          `[n8n-grades] Found paper by ID: ${
            paper ? paper.original_filename : "not found"
          }`
        );
      }

      // Strategy 2: Use originalFilename if provided
      if (!paper && originalFilename) {
        paper = await prisma.paper.findFirst({
          where: { original_filename: originalFilename },
          orderBy: { created_at: "desc" },
        });
        console.log(
          `[n8n-grades] Found paper by filename: ${
            paper ? paper.original_filename : "not found"
          }`
        );
      }

      // Strategy 3: Use submissionId to find latest paper
      if (!paper && (submissionId || dbSubmissionId)) {
        const submissionIdToUse = dbSubmissionId || submissionId;
        paper = await prisma.paper.findFirst({
          where: { submission_id: submissionIdToUse },
          orderBy: { created_at: "desc" },
        });
        console.log(
          `[n8n-grades] Found paper by submission: ${
            paper ? paper.original_filename : "not found"
          }`
        );
      }

      // Strategy 4: Fallback to most recent paper (but only if we have a student name match)
      if (!paper && studentName) {
        paper = await prisma.paper.findFirst({
          where: { student_name: studentName },
          orderBy: { created_at: "desc" },
        });
        console.log(
          `[n8n-grades] Found paper by student name fallback: ${
            paper ? paper.original_filename : "not found"
          }`
        );
      }

      // Strategy 5: Last resort - most recent paper
      if (!paper) {
        paper = await prisma.paper.findFirst({
          orderBy: { created_at: "desc" },
        });
        console.log(
          `[n8n-grades] Found paper by last resort fallback: ${
            paper ? paper.original_filename : "not found"
          }`
        );
      }

      if (!paper) {
        console.error(`[n8n-grades] Paper not found for grade: ${studentName}`);
        continue;
      }

      // Process comments (handle both array and string formats)
      let processedGoodComments = goodComments;
      let processedBadComments = badComments;

      if (Array.isArray(goodComments)) {
        processedGoodComments = goodComments.join(" ");
      }
      if (Array.isArray(badComments)) {
        processedBadComments = badComments.join(" ");
      }

      // Check if this paper already has a grade to prevent duplicate processing
      const existingGrade = await prisma.grade.findUnique({
        where: { paper_id: paper.id },
      });

      if (existingGrade) {
        console.log(
          `[n8n-grades] Paper ${paper.original_filename} already has a grade, skipping duplicate processing`
        );
        continue;
      }

      // Create grade
      const gradeResult = await prisma.grade.create({
        data: {
          id: randomUUID(),
          submission_id: paper.submission_id,
          paper_id: paper.id,
          student_name: studentName,
          total_score: score,
          criteria_scores: {
            goodComments: processedGoodComments,
            badComments: processedBadComments,
          },
        },
      });

      console.log(
        `[n8n-grades] Created grade: ${gradeResult.id} for paper: ${paper.original_filename}`
      );
    }

    // Sequential processing: trigger next paper for each unique submission (ONCE PER SUBMISSION)
    const processedSubmissions = new Set<string>();

    // Collect unique submission IDs from the papers that were just graded
    for (const grade of grades) {
      const { paperId, dbPaperId, submissionId, dbSubmissionId } = grade;

      // Find the paper that was just graded using the same logic as above
      let paper = null;

      // Strategy 1: Use paperId/dbPaperId if provided
      if (paperId || dbPaperId) {
        paper = await prisma.paper.findUnique({
          where: { id: dbPaperId || paperId },
        });
      }

      // Strategy 2: Use originalFilename if provided
      if (!paper && grade.originalFilename) {
        paper = await prisma.paper.findFirst({
          where: { original_filename: grade.originalFilename },
          orderBy: { created_at: "desc" },
        });
      }

      // Strategy 3: Use submissionId to find latest paper
      if (!paper && (submissionId || dbSubmissionId)) {
        const submissionIdToUse = dbSubmissionId || submissionId;
        paper = await prisma.paper.findFirst({
          where: { submission_id: submissionIdToUse },
          orderBy: { created_at: "desc" },
        });
      }

      // Strategy 4: Fallback to most recent paper (but only if we have a student name match)
      if (!paper && grade.studentName) {
        paper = await prisma.paper.findFirst({
          where: { student_name: grade.studentName },
          orderBy: { created_at: "desc" },
        });
      }

      // Strategy 5: Last resort - most recent paper
      if (!paper) {
        paper = await prisma.paper.findFirst({
          orderBy: { created_at: "desc" },
        });
      }

      if (paper) {
        processedSubmissions.add(paper.submission_id);
        console.log(
          `[n8n-grades] Added submission ${paper.submission_id} to sequential processing queue`
        );
      } else {
        console.log(
          `[n8n-grades] Could not find paper for grade, skipping sequential processing`
        );
      }
    }

    console.log(
      `[n8n-grades] Will process ${processedSubmissions.size} unique submissions for sequential processing`
    );

    // Process each unique submission once
    for (const submissionId of processedSubmissions) {
      const submissionPapers = await prisma.paper.findMany({
        where: { submission_id: submissionId },
        orderBy: { created_at: "asc" },
      });

      const gradedPapers = await prisma.grade.findMany({
        where: {
          paper_id: { in: submissionPapers.map((p) => p.id) },
        },
      });

      const gradedPaperIds = new Set(gradedPapers.map((g) => g.paper_id));
      const nextPaper = submissionPapers.find((p) => !gradedPaperIds.has(p.id));

      if (nextPaper) {
        console.log(
          `[n8n-grades] Triggering next paper: ${nextPaper.original_filename}`
        );

        // Get upload type and file buffers from cache
        const metaRows = (await prisma.$queryRawUnsafe<any[]>(
          `SELECT upload_type FROM tbl_submission_meta WHERE submission_id = $1::uuid LIMIT 1`,
          submissionId
        )) as any[];

        const fileBuffers = fileBufferCache.get(submissionId);
        if (!fileBuffers) {
          console.error(
            `[n8n-grades] File buffers not found for submission: ${submissionId}`
          );
          continue;
        }

        const uploadType = metaRows[0]?.upload_type || "papers";
        const paperBuffer = fileBuffers.paperBuffers.get(nextPaper.id);

        if (!paperBuffer) {
          console.error(
            `[n8n-grades] Paper buffer not found for paper: ${nextPaper.id}`
          );
          continue;
        }

        const formData = new FormData();
        appendBufferToFormData(
          formData,
          "rubricFile",
          fileBuffers.rubricBuffer,
          "rubric.pdf",
          "application/pdf"
        );

        // Add question file for exam projects
        if (uploadType === "exam-projects" && fileBuffers.questionBuffer) {
          appendBufferToFormData(
            formData,
            "questionFile",
            fileBuffers.questionBuffer,
            "question.pdf",
            "application/pdf"
          );
        }

        appendBufferToFormData(
          formData,
          "paperFile",
          paperBuffer,
          nextPaper.original_filename || "paper.pdf",
          nextPaper.mime_type || "application/pdf"
        );

        // Send metadata as separate form fields
        formData.append("dbSubmissionId", submissionId);
        formData.append("dbPaperId", nextPaper.id);
        formData.append("originalFilename", nextPaper.original_filename);

        // Choose webhook URL based on upload type
        const webhookUrl =
          uploadType === "exam-projects"
            ? N8N_EXAM_PROJECTS_WEBHOOK_URL
            : N8N_WEBHOOK_URL;

        if (!webhookUrl) {
          const key =
            uploadType === "exam-projects"
              ? "N8N_EXAM_PROJECTS_WEBHOOK_URL"
              : "N8N_WEBHOOK_URL";
          throw new Error(`Missing ${key} in environment`);
        }

        const n8nResponse = await fetch(webhookUrl, {
          method: "POST",
          body: formData,
        });

        if (n8nResponse.ok) {
          console.log(
            `[n8n-grades] Successfully triggered next paper: ${nextPaper.original_filename}`
          );
        } else {
          console.error(
            `[n8n-grades] Failed to trigger next paper: ${n8nResponse.statusText}`
          );
        }
      } else {
        // All papers graded, mark submission as completed and cleanup buffers
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: "COMPLETED" },
        });
        cleanupSubmissionBuffers(submissionId);
        console.log(
          `[n8n-grades] All papers graded for submission: ${submissionId}`
        );
      }
    }

    res.json({ success: true, message: `Processed ${grades.length} grade(s)` });
  } catch (error: any) {
    console.error("[n8n-grades] Error:", error);
    res
      .status(500)
      .json({ error: error.message || "Failed to process grades" });
  }
});

// GET /api/grades - Get all grades (with RBAC filtering)
router.get(
  "/grades",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { subjectId, classId } = req.query;
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      // Build base query
      let query = `
      SELECT 
        g.id as grade_id,
        g.student_name,
        g.total_score,
        g.criteria_scores,
        g.created_at as graded_at,
        p.original_filename,
        p.created_at as uploaded_at,
        sj.id as subject_id,
        sj.name as subject_name,
        sj.code as subject_code,
        cs.class_id
      FROM tbl_grades g
      JOIN tbl_papers p ON g.paper_id = p.id
      LEFT JOIN tbl_subjects sj ON p.subject_id = sj.id
      LEFT JOIN tbl_class_subjects cs ON sj.id = cs.subject_id
      LEFT JOIN tbl_classes c ON cs.class_id = c.id
    `;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      // RBAC: Teachers can only see grades from their assigned classes
      if (userRole === "TEACHER") {
        conditions.push(`c.teacher_id = $${paramIndex}::uuid`);
        params.push(userId);
        paramIndex++;
      }

      // Filter by classId if provided
      if (classId) {
        conditions.push(`cs.class_id = $${paramIndex}::uuid`);
        params.push(classId);
        paramIndex++;
      }

      // Filter by subjectId if provided
      if (subjectId) {
        conditions.push(`sj.id = $${paramIndex}::uuid`);
        params.push(subjectId);
        paramIndex++;
      }

      // Add WHERE clause if there are conditions
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }

      query += ` ORDER BY g.created_at DESC`;

      console.log(
        `[grades] Fetching grades for ${userRole} (userId: ${userId}) with filters:`,
        { classId, subjectId }
      );

      const rows = (await prisma.$queryRawUnsafe<any[]>(
        query,
        ...params
      )) as any[];

      const grades = rows.map((row) => ({
        id: row.grade_id,
        studentName: row.student_name,
        score: row.total_score,
        goodComments: row.criteria_scores?.goodComments || "",
        badComments: row.criteria_scores?.badComments || "",
        gradedAt: row.graded_at,
        paperFilename: row.original_filename,
        uploadedAt: row.uploaded_at,
        subjectId: row.subject_id,
        subjectName: row.subject_name,
        subjectCode: row.subject_code,
        classId: row.class_id,
      }));

      console.log(`[grades] Returning ${grades.length} grades`);

      res.json({ grades });
    } catch (error: any) {
      console.error("[grades] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch grades" });
    }
  }
);

// PUT /api/grades/:id - Update grade feedback
router.put(
  "/grades/:id",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { goodComments, badComments } = req.body;

      if (!id) {
        return res.status(400).json({ error: "Grade ID is required" });
      }

      // Find the grade
      const grade = await prisma.grade.findUnique({
        where: { id },
      });

      if (!grade) {
        return res.status(404).json({ error: "Grade not found" });
      }

      // Update the criteria_scores with new comments
      const updatedCriteriaScores = {
        ...(grade.criteria_scores as any),
        goodComments: goodComments || "",
        badComments: badComments || "",
      };

      // Update the grade
      const updatedGrade = await prisma.grade.update({
        where: { id },
        data: {
          criteria_scores: updatedCriteriaScores,
        },
      });

      console.log(`[grades] Updated feedback for grade: ${id}`);

      res.json({
        success: true,
        message: "Feedback updated successfully",
        grade: {
          id: updatedGrade.id,
          goodComments: updatedCriteriaScores.goodComments,
          badComments: updatedCriteriaScores.badComments,
        },
      });
    } catch (error: any) {
      console.error("[grades] Error updating feedback:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to update feedback" });
    }
  }
);

// GET /api/subjects - Get all subjects
router.get(
  "/subjects",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const rows = (await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, name, code, created_at FROM tbl_subjects ORDER BY name ASC`
      )) as any[];
      res.json({ subjects: rows });
    } catch (error: any) {
      console.error("[subjects] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch subjects" });
    }
  }
);

// POST /api/subjects - Create new subject
router.post(
  "/subjects",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { name, code } = req.body;

      if (!name) {
        return res.status(400).json({ error: "Subject name is required" });
      }

      const row = (await prisma.$queryRawUnsafe<any[]>(
        `
      INSERT INTO tbl_subjects (name, code)
      VALUES ($1, $2)
      RETURNING id, name, code, created_at
    `,
        name,
        code || null
      )) as any[];

      res.json({ subject: row[0] });
    } catch (error: any) {
      console.error("[subjects] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to create subject" });
    }
  }
);

// GET /api/dashboard/stats - Get dashboard statistics
router.get(
  "/dashboard/stats",
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      console.log("[dashboard-stats] Fetching dashboard statistics...");

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Total number of courses/subjects
      const totalCourses = await prisma.subject.count();
      console.log("[dashboard-stats] Total courses:", totalCourses);

      // Total papers graded all time
      const totalGraded = await prisma.grade.count();
      console.log("[dashboard-stats] Total graded:", totalGraded);

      // Papers graded this week
      const gradedThisWeek = await prisma.grade.count({
        where: {
          created_at: {
            gte: weekAgo,
          },
        },
      });
      console.log("[dashboard-stats] Graded this week:", gradedThisWeek);

      // Number of unique students graded
      const uniqueStudents = await prisma.grade.findMany({
        select: {
          student_name: true,
        },
        distinct: ["student_name"],
      });
      const studentsGraded = uniqueStudents.length;
      console.log("[dashboard-stats] Students graded:", studentsGraded);

      const result = {
        totalCourses,
        totalGraded,
        gradedThisWeek,
        studentsGraded,
      };

      console.log("[dashboard-stats] Returning:", result);

      res.json(result);
    } catch (error: any) {
      console.error("[dashboard-stats] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch dashboard stats" });
    }
  }
);

// GET /api/health - Health check
router.get("/health", async (req: Request, res: Response) => {
  try {
    const info = await prisma.$queryRawUnsafe<any>(
      "select inet_server_port()::int as port, current_database() as db"
    );
    const dbPort = info?.[0]?.port ?? "?";
    const dbName = info?.[0]?.db ?? "?";
    return res.json({
      status: "OK",
      database: `Connected to ${dbName} on port ${dbPort}`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[health] Error:", error);
    return res.status(500).json({
      status: "ERROR",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// POST /api/exam-projects - Upload exam projects for grading
router.post(
  "/exam-projects",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  examProjectsUpload.fields([
    { name: "rubricFile", maxCount: 1 },
    { name: "questionFile", maxCount: 1 },
    { name: "paperFiles", maxCount: 5 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const rubricFile = files.rubricFile?.[0];
      const questionFile = files.questionFile?.[0];
      const paperFiles = files.paperFiles || [];
      const { subjectName, subjectCode, classId, subjectId: bodySubjectId } = req.body;

      if (!rubricFile) {
        return res.status(400).json({ error: "Rubric file is required" });
      }

      if (!questionFile) {
        return res.status(400).json({ error: "Question file is required" });
      }

      if (!paperFiles || paperFiles.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one exam project file is required" });
      }

      console.log(
        `[exam-projects] Processing ${paperFiles.length} exam projects with rubric: ${rubricFile.originalname} and question: ${questionFile.originalname}`
      );

      // Handle subject (prioritize new classId/subjectId approach, fallback to old subjectName approach)
      let subjectId = bodySubjectId || null;
      
      if (!subjectId && (subjectName || subjectCode)) {
        // Legacy support: create/find subject by name/code
        const existingSubject = await prisma.subject.findFirst({
          where: {
            OR: [
              subjectName ? { name: subjectName } : {},
              subjectCode ? { code: subjectCode } : {},
            ],
          },
        });

        if (existingSubject) {
          subjectId = existingSubject.id;
        } else {
          const newSubject = await prisma.subject.create({
            data: {
              name: subjectName || "Unnamed Subject",
              code: subjectCode || null,
            },
          });
          subjectId = newSubject.id;
        }
      }
      
      // Verify class and subject assignment if classId provided
      if (classId && subjectId) {
        const classSubject = await prisma.classSubject.findFirst({
          where: {
            class_id: classId,
            subject_id: subjectId,
          },
        });
        
        if (!classSubject) {
          return res.status(400).json({ 
            error: "Subject is not assigned to the selected class" 
          });
        }
        
        console.log(`[exam-projects] Verified subject ${subjectId} is assigned to class ${classId}`);
      }

      // Create or get a dummy rubric for exam projects
      let rubricId = "00000000-0000-0000-0000-000000000000";
      try {
        const existingRubric = await prisma.rubric.findUnique({
          where: { id: rubricId },
        });
        if (!existingRubric) {
          await prisma.rubric.create({
            data: {
              id: rubricId,
              title: "Exam Projects Rubric",
              criteria: {},
            },
          });
        }
      } catch (error) {
        console.warn("[exam-projects] Could not create dummy rubric:", error);
      }

      // Create submission
      const submission = await prisma.submission.create({
        data: {
          rubric_id: rubricId,
        },
      });

      // Validate buffers exist (memory storage)
      if (!rubricFile.buffer) {
        throw new Error("Rubric file buffer is missing");
      }
      if (!questionFile.buffer) {
        throw new Error("Question file buffer is missing");
      }

      // Store file buffers in memory cache for sequential processing
      const paperBuffers = new Map<string, Buffer>();
      const papers = [];

      for (const paperFile of paperFiles) {
        if (!paperFile.buffer) {
          throw new Error(
            `Paper file buffer is missing for: ${paperFile.originalname}`
          );
        }

        const paper = await prisma.paper.create({
          data: {
            submission_id: submission.id,
            original_filename: paperFile.originalname,
            storage_path: "", // No longer storing files on disk
            student_name: "Unknown Student", // Will be extracted by n8n
            mime_type: paperFile.mimetype,
            subject_id: subjectId,
          },
        });

        // Store buffer keyed by paper ID for sequential processing
        paperBuffers.set(paper.id, paperFile.buffer);
        papers.push(paper);
      }

      // Cache buffers for sequential processing
      fileBufferCache.set(submission.id, {
        rubricBuffer: rubricFile.buffer,
        questionBuffer: questionFile.buffer,
        paperBuffers: paperBuffers,
      });

      // Store upload type for processing (no longer storing paths)
      await prisma.$queryRawUnsafe(
        `
      INSERT INTO tbl_submission_meta (submission_id, rubric_path, question_path, upload_type)
      VALUES ($1::uuid, $2, $3, $4)
      ON CONFLICT (submission_id) DO UPDATE SET 
        rubric_path = EXCLUDED.rubric_path,
        question_path = EXCLUDED.question_path,
        upload_type = EXCLUDED.upload_type
    `,
        submission.id,
        "", // No longer storing file paths
        "", // No longer storing file paths
        "exam-projects"
      );

      // Send FIRST paper only to n8n for grading (sequential flow, same as papers)
      const firstPaper = papers[0];
      if (!firstPaper) {
        throw new Error("No exam projects to process");
      }

      const firstPaperBuffer = paperBuffers.get(firstPaper.id);
      if (!firstPaperBuffer) {
        throw new Error("First paper buffer not found");
      }

      const formData = new FormData();
      appendBufferToFormData(
        formData,
        "rubricFile",
        rubricFile.buffer,
        rubricFile.originalname,
        rubricFile.mimetype
      );
      appendBufferToFormData(
        formData,
        "questionFile",
        questionFile.buffer,
        questionFile.originalname,
        questionFile.mimetype
      );
      appendBufferToFormData(
        formData,
        "paperFile",
        firstPaperBuffer,
        firstPaper.original_filename || "paper.pdf",
        firstPaper.mime_type || "application/pdf"
      );

      // Send metadata as separate form fields
      formData.append("dbSubmissionId", submission.id);
      formData.append("dbPaperId", firstPaper.id);
      formData.append("originalFilename", firstPaper.original_filename || "");
      if (subjectName) formData.append("subjectName", subjectName);
      if (subjectCode) formData.append("subjectCode", subjectCode);

      console.log(
        `[exam-projects] Sending first exam project to n8n: ${firstPaper.original_filename}`
      );

      const n8nResponse = await fetch(N8N_EXAM_PROJECTS_WEBHOOK_URL, {
        method: "POST",
        body: formData,
      });

      if (!n8nResponse.ok) {
        throw new Error(`n8n request failed: ${n8nResponse.statusText}`);
      }

      const n8nResult = await n8nResponse.text();
      console.log(`[exam-projects] n8n response:`, n8nResult);

      res.json({
        submissionId: submission.id,
        totalPapers: paperFiles.length,
        message: "Exam projects submitted for grading",
        firstPaperId: firstPaper.id,
      });
    } catch (error: any) {
      console.error("[exam-projects] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to process exam projects" });
    }
  }
);

// POST /api/exam-projects/n8n/grades - Callback from n8n for exam project grades
router.post(
  "/exam-projects/n8n/grades",
  async (req: Request, res: Response) => {
    try {
      // Handle both formats: direct object {grades: [...]} or array [{grades: [...]}]
      let grades;
      if (
        Array.isArray(req.body) &&
        req.body.length > 0 &&
        req.body[0].grades
      ) {
        // Format: [{grades: [...]}]
        grades = req.body[0].grades;
      } else if (req.body.grades) {
        // Format: {grades: [...]}
        grades = req.body.grades;
      } else {
        return res.status(400).json({ error: "Invalid grades data format" });
      }

      if (!grades || !Array.isArray(grades)) {
        return res.status(400).json({ error: "Invalid grades data" });
      }

      console.log(
        `[exam-grades] Received ${grades.length} exam project grades`
      );

      const processedSubmissions = new Set<string>();

      for (const grade of grades) {
        const {
          studentName,
          introduction,
          introductionMark,
          main,
          mainMark,
          solutionTechnical,
          solutionTechnicalMark,
          summaryAndConclusion,
          summaryAndConclusionMark,
          referencesResearchPenmanship,
          referencesResearchPenmanshipMark,
        } = grade;

        if (!studentName) {
          console.warn("[exam-grades] Skipping grade without student name");
          continue;
        }

        // Find the paper by student name, or by "Unknown Student" if not found
        let paper = await prisma.paper.findFirst({
          where: { student_name: studentName },
          orderBy: { created_at: "desc" },
        });

        // If not found by exact name, try to find by "Unknown Student" (most recent)
        if (!paper) {
          paper = await prisma.paper.findFirst({
            where: { student_name: "Unknown Student" },
            orderBy: { created_at: "desc" },
          });

          // Update the student name if we found a paper
          if (paper) {
            await prisma.paper.update({
              where: { id: paper.id },
              data: { student_name: studentName },
            });
            console.log(
              `[exam-grades] Updated student name to: ${studentName}`
            );
          }
        }

        if (!paper) {
          console.warn(
            `[exam-grades] Paper not found for student: ${studentName}`
          );
          continue;
        }

        // Check if grade already exists
        const existingGrade = await prisma.grade.findUnique({
          where: { paper_id: paper.id },
        });

        if (existingGrade) {
          console.log(
            `[exam-grades] Grade already exists for ${studentName}, skipping`
          );
          continue;
        }

        // Calculate total score
        const totalScore = Math.round(
          (introductionMark +
            mainMark +
            solutionTechnicalMark +
            summaryAndConclusionMark +
            referencesResearchPenmanshipMark) /
            5
        );

        // Create comprehensive feedback
        const comprehensiveFeedback = {
          introduction: { feedback: introduction, mark: introductionMark },
          main: { feedback: main, mark: mainMark },
          solutionTechnical: {
            feedback: solutionTechnical,
            mark: solutionTechnicalMark,
          },
          summaryAndConclusion: {
            feedback: summaryAndConclusion,
            mark: summaryAndConclusionMark,
          },
          referencesResearchPenmanship: {
            feedback: referencesResearchPenmanship,
            mark: referencesResearchPenmanshipMark,
          },
        };

        // Create grade record
        await prisma.grade.create({
          data: {
            paper_id: paper.id,
            submission_id: paper.submission_id,
            student_name: studentName,
            total_score: totalScore,
            comments: JSON.stringify(comprehensiveFeedback),
            criteria_scores: {
              introduction: introductionMark,
              main: mainMark,
              solutionTechnical: solutionTechnicalMark,
              summaryAndConclusion: summaryAndConclusionMark,
              referencesResearchPenmanship: referencesResearchPenmanshipMark,
            },
          },
        });

        console.log(
          `[exam-grades] Created grade for ${studentName}: ${totalScore}/100`
        );

        // Track submission for sequential processing
        processedSubmissions.add(paper.submission_id);
      }

      // Sequential processing: trigger next exam project for each unique submission
      console.log(
        `[exam-grades] Processing ${processedSubmissions.size} unique submissions for sequential processing`
      );

      for (const submissionId of processedSubmissions) {
        const submissionPapers = await prisma.paper.findMany({
          where: { submission_id: submissionId },
          orderBy: { created_at: "asc" },
        });

        const gradedPapers = await prisma.grade.findMany({
          where: {
            paper_id: { in: submissionPapers.map((p) => p.id) },
          },
        });

        const gradedPaperIds = new Set(gradedPapers.map((g) => g.paper_id));
        const nextPaper = submissionPapers.find((p) => !gradedPaperIds.has(p.id));

        if (nextPaper) {
          console.log(
            `[exam-grades] Triggering next exam project: ${nextPaper.original_filename}`
          );

          // Get file buffers from cache
          const fileBuffers = fileBufferCache.get(submissionId);
          if (!fileBuffers) {
            console.error(
              `[exam-grades] File buffers not found for submission: ${submissionId}`
            );
            continue;
          }

          const paperBuffer = fileBuffers.paperBuffers.get(nextPaper.id);
          if (!paperBuffer) {
            console.error(
              `[exam-grades] Paper buffer not found for paper: ${nextPaper.id}`
            );
            continue;
          }

          const formData = new FormData();
          appendBufferToFormData(
            formData,
            "rubricFile",
            fileBuffers.rubricBuffer,
            "rubric.pdf",
            "application/pdf"
          );

          // Add question file for exam projects
          if (fileBuffers.questionBuffer) {
            appendBufferToFormData(
              formData,
              "questionFile",
              fileBuffers.questionBuffer,
              "question.pdf",
              "application/pdf"
            );
          }

          appendBufferToFormData(
            formData,
            "paperFile",
            paperBuffer,
            nextPaper.original_filename || "paper.pdf",
            nextPaper.mime_type || "application/pdf"
          );

          // Send metadata as separate form fields
          formData.append("dbSubmissionId", submissionId);
          formData.append("dbPaperId", nextPaper.id);
          formData.append("originalFilename", nextPaper.original_filename || "");

          const n8nResponse = await fetch(N8N_EXAM_PROJECTS_WEBHOOK_URL, {
            method: "POST",
            body: formData,
          });

          if (n8nResponse.ok) {
            console.log(
              `[exam-grades] Successfully triggered next exam project: ${nextPaper.original_filename}`
            );
          } else {
            console.error(
              `[exam-grades] Failed to trigger next exam project: ${n8nResponse.statusText}`
            );
          }
        } else {
          // All exam projects graded, mark submission as completed and cleanup buffers
          await prisma.submission.update({
            where: { id: submissionId },
            data: { status: "COMPLETED" },
          });
          cleanupSubmissionBuffers(submissionId);
          console.log(
            `[exam-grades] All exam projects graded for submission: ${submissionId}`
          );
        }
      }

      res.json({ message: "Exam project grades processed successfully" });
    } catch (error: any) {
      console.error("[exam-grades] Error:", error);
      res.status(500).json({
        error: error.message || "Failed to process exam project grades",
      });
    }
  }
);

// GET /api/exam-projects/grades - Get exam project grades
router.get(
  "/exam-projects/grades",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { subjectId } = req.query;

      const whereClause = subjectId ? { subject_id: subjectId as string } : {};

      const grades = await prisma.grade.findMany({
        where: {
          tbl_papers: {
            tbl_submissions: {
              tbl_rubrics: {
                title: "Exam Projects Rubric", // Filter for exam projects only
              },
            },
            ...whereClause,
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

      // Transform the data for frontend
      const transformedGrades = grades.map((grade) => {
        const comprehensiveFeedback = JSON.parse(grade.comments || "{}");
        const criteriaScores = grade.criteria_scores as any;

        return {
          id: grade.id,
          studentName: grade.tbl_papers.student_name,
          paperFilename: grade.tbl_papers.original_filename || "Unknown",
          uploadedAt: grade.tbl_papers.created_at,
          subjectName: grade.tbl_papers.tbl_subjects?.name || "Unknown Subject",
          subjectCode: grade.tbl_papers.tbl_subjects?.code || null,
          totalScore: Number(grade.total_score),
          criteriaScores,
          comprehensiveFeedback,
        };
      });

      res.json({ grades: transformedGrades });
    } catch (error: any) {
      console.error("[exam-grades] Error fetching grades:", error);
      res
        .status(500)
        .json({
          error: error.message || "Failed to fetch exam project grades",
        });
    }
  }
);

export default router;
