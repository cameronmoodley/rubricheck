import express, { Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import { randomUUID } from "crypto";
import FormData from "form-data";
import fetch from "node-fetch";
import { PrismaClient } from "@prisma/client";
import { authenticateToken, checkRole, authenticateWebhook } from "../auth/auth";
import { uploadRateLimiter } from "../lib/rate-limit";
import { logger } from "../lib/logger";
import { logAudit, getClientIp } from "../lib/audit";
import { sanitizeErrorMessage } from "../lib/sanitize-error";
import { sendGradingCompleteEmail } from "../lib/email";
import { getTemplatePdfBase64 } from "../data/rubric-templates";
import { textToPdfBuffer } from "../lib/text-to-pdf";

const router = express.Router();
const prisma = new PrismaClient();

// n8n webhook URLs from env
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const N8N_EXAM_PROJECTS_WEBHOOK_URL =
  process.env.N8N_EXAM_PROJECTS_WEBHOOK_URL;

import { getN8nRequestHeaders } from "../lib/n8n-client";

// Parse section-based grade format (intro, introMark, main, mainMark, etc.) into sections + total score.
// Supports: introduction/introductionMark, main/mainMark, solutionTechnical/solutionTechnicalMark, etc.
function parseSectionBasedGrade(grade: Record<string, unknown>): {
  score: number;
  criteriaScores: Record<string, unknown>;
} {
  const sections: Array<{ name: string; feedback: string; mark: number }> = [];
  const marks: number[] = [];

  for (const [key, value] of Object.entries(grade)) {
    if (key.endsWith("Mark") && typeof value === "number") {
      const baseKey = key.slice(0, -4); // "introductionMark" -> "introduction"
      const feedback = (grade[baseKey] as string) || "";
      const displayName = baseKey
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (c) => c.toUpperCase())
        .trim();
      sections.push({ name: displayName, feedback, mark: value });
      marks.push(value);
    }
  }

  const computedScore = marks.length > 0 ? Math.round(marks.reduce((a, b) => a + b, 0) / marks.length) : 0;
  const score = typeof grade.score === "number" ? grade.score : computedScore;

  const criteriaScores: Record<string, unknown> = {
    goodComments: (grade.goodComments as string) || "",
    badComments: (grade.badComments as string) || "",
  };
  if (sections.length > 0) {
    criteriaScores.sections = sections;
  }
  return { score, criteriaScores };
}

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
  logger.debug({ submissionId }, "Removed file buffers for submission");
}

// Trigger next ungraded paper for a submission (used by n8n callback and retry)
async function triggerNextPaper(submissionId: string): Promise<boolean> {
  const submissionPapers = await prisma.paper.findMany({
    where: { submission_id: submissionId },
    orderBy: { created_at: "asc" },
  });

  const gradedPapers = await prisma.grade.findMany({
    where: { paper_id: { in: submissionPapers.map((p) => p.id) } },
  });

  const gradedPaperIds = new Set(gradedPapers.map((g) => g.paper_id));
  const nextPaper = submissionPapers.find((p) => !gradedPaperIds.has(p.id));

  if (!nextPaper) return false;

  const metaRows = (await prisma.$queryRawUnsafe<any[]>(
    `SELECT upload_type FROM tbl_submission_meta WHERE submission_id = $1::uuid LIMIT 1`,
    submissionId
  )) as any[];

  const fileBuffers = fileBufferCache.get(submissionId);
  if (!fileBuffers) {
    logger.error({ submissionId }, "File buffers not found");

    return false;
  }

  const uploadType = metaRows[0]?.upload_type || "papers";
  const paperBuffer = fileBuffers.paperBuffers.get(nextPaper.id);

  if (!paperBuffer) {
    logger.error({ paperId: nextPaper.id }, "Paper buffer not found");
    return false;
  }

  const formData = new FormData();
  appendBufferToFormData(formData, "rubricFile", fileBuffers.rubricBuffer, "rubric.pdf", "application/pdf");
  if (uploadType === "exam-projects" && fileBuffers.questionBuffer) {
    appendBufferToFormData(formData, "questionFile", fileBuffers.questionBuffer, "question.pdf", "application/pdf");
  }
  appendBufferToFormData(
    formData,
    "paperFile",
    paperBuffer,
    nextPaper.original_filename || "paper.pdf",
    nextPaper.mime_type || "application/pdf"
  );
  formData.append("dbSubmissionId", submissionId);
  formData.append("dbPaperId", nextPaper.id);
  formData.append("originalFilename", nextPaper.original_filename || "");

  const webhookUrl =
    uploadType === "exam-projects" ? N8N_EXAM_PROJECTS_WEBHOOK_URL : N8N_WEBHOOK_URL;

  if (!webhookUrl) return false;

  const n8nResponse = await fetch(webhookUrl, {
    method: "POST",
    body: formData,
    headers: getN8nRequestHeaders(),
  });
  return n8nResponse.ok;
}

// POST /api/submissions - Upload papers for grading
router.post(
  "/submissions",
  uploadRateLimiter,
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  upload.fields([
    { name: "rubricFile", maxCount: 1 },
    { name: "paperFiles", maxCount: 25 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let rubricFile = files.rubricFile?.[0];
      const paperFiles = files.paperFiles || [];
      const { subjectName, subjectCode, uploadType, classId, subjectId: bodySubjectId, templateId } = req.body;

      if (!rubricFile && templateId) {
        const template = await prisma.rubricTemplate.findUnique({
          where: { id: templateId },
        });
        if (!template) {
          return res.status(400).json({ error: "Invalid rubric template" });
        }
        const pdfBuffer = Buffer.from(getTemplatePdfBase64(), "base64");
        rubricFile = {
          fieldname: "rubricFile",
          originalname: `rubric-${template.name}.pdf`,
          encoding: "7bit",
          mimetype: "application/pdf",
          buffer: pdfBuffer,
          size: pdfBuffer.length,
        } as Express.Multer.File;
      }

      if (!rubricFile) {
        return res.status(400).json({ error: "Rubric file or template is required" });
      }

      if (!paperFiles || paperFiles.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one paper file is required" });
      }

      logger.info(
        { paperCount: paperFiles.length, rubricName: rubricFile.originalname },
        "Processing papers with rubric"
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
        const classData = await prisma.class.findUnique({
          where: { id: classId },
        });

        if (!classData) {
          return res.status(400).json({ error: "Class not found" });
        }

        // Teachers can only upload to classes they're assigned to
        const userRole = req.user?.role;
        const userId = req.user?.userId;
        if (userRole === "TEACHER" && classData.teacher_id !== userId) {
          return res.status(403).json({ error: "Access denied to this class" });
        }

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
        
        logger.debug({ subjectId, classId }, "Verified subject assigned to class");
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
          ...(req.user?.userId && { submitted_by_id: req.user.userId }),
        },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "UPLOAD",
        resource: "submission",
        resourceId: submission.id,
        details: { paperCount: paperFiles.length, subjectId },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
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

      logger.info(
        { uploadType, filename: firstPaper.original_filename },
        `Sending first ${uploadType === "exam-projects" ? "exam project" : "paper"} to n8n`
      );

      const n8nResponse = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
        headers: getN8nRequestHeaders(),
      });

      if (!n8nResponse.ok) {
        throw new Error(`n8n request failed: ${n8nResponse.statusText}`);
      }

      const n8nResult = await n8nResponse.text();
      logger.debug({ n8nResult }, "n8n response");

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
      logger.error({ err: error }, "Upload error");
      res.status(500).json({
        error: sanitizeErrorMessage(error.message, "Upload failed"),
      });
    }
  }
);

// POST /api/n8n/grades - Callback from n8n for paper grading results
router.post("/n8n/grades", authenticateWebhook, async (req: Request, res: Response) => {
  try {
    logger.info("Received grading results from n8n");
    logger.debug({ body: req.body }, "n8n-grades request body");

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

    logger.info({ count: grades.length }, "Processing grades");

    for (const grade of grades) {
      const {
        studentName,
        paperToken,
        paperId,
        dbPaperId,
        db_paper_id,
        originalFilename,
        submissionId,
        dbSubmissionId,
        db_submission_id,
        score,
        goodComments,
        badComments,
      } = grade;
      const resolvedPaperId = dbPaperId || db_paper_id || paperId;
      const resolvedSubmissionId = dbSubmissionId || db_submission_id || submissionId;

      logger.debug({ studentName, score, resolvedPaperId }, "Processing grade");

      // Find paper using multiple strategies
      let paper = null;

      // Strategy 1: Use paperId/dbPaperId if provided (n8n must pass these from the incoming webhook)
      if (resolvedPaperId) {
        paper = await prisma.paper.findUnique({
          where: { id: resolvedPaperId },
        });
        logger.debug(
          { found: !!paper, filename: paper?.original_filename },
          "Found paper by ID"
        );
      }

      // Strategy 2: Use originalFilename if provided
      if (!paper && originalFilename) {
        paper = await prisma.paper.findFirst({
          where: { original_filename: originalFilename },
          orderBy: { created_at: "desc" },
        });
        logger.debug(
          { found: !!paper, filename: paper?.original_filename },
          "Found paper by filename"
        );
      }

      // Strategy 3: Use submissionId - find OLDEST ungraded paper (we process sequentially, oldest first)
      // Using "most recent" was wrong: with 2 papers, callbacks without dbPaperId always matched Paper 2,
      // causing Paper 1 to be re-sent and never graded.
      if (!paper && resolvedSubmissionId) {
        const submissionIdToUse = resolvedSubmissionId;
        const submissionPapers = await prisma.paper.findMany({
          where: { submission_id: submissionIdToUse },
          orderBy: { created_at: "asc" },
        });
        const gradedPaperIds = new Set(
          (await prisma.grade.findMany({
            where: { paper_id: { in: submissionPapers.map((p) => p.id) } },
            select: { paper_id: true },
          })).map((g) => g.paper_id)
        );
        paper = submissionPapers.find((p) => !gradedPaperIds.has(p.id)) ?? null;
        if (paper) {
          logger.debug(
            { found: true, filename: paper.original_filename },
            "Found paper by submission (oldest ungraded)"
          );
        }
      }

      // Strategy 4: Fallback to most recent paper (but only if we have a student name match)
      if (!paper && studentName) {
        paper = await prisma.paper.findFirst({
          where: { student_name: studentName },
          orderBy: { created_at: "desc" },
        });
        logger.debug(
          { found: !!paper, filename: paper?.original_filename },
          "Found paper by student name fallback"
        );
      }

      // Strategy 5: Last resort - most recent paper
      if (!paper) {
        paper = await prisma.paper.findFirst({
          orderBy: { created_at: "desc" },
        });
        logger.debug(
          { found: !!paper, filename: paper?.original_filename },
          "Found paper by last resort fallback"
        );
      }

      if (!paper) {
        logger.warn({ studentName }, "Paper not found for grade");
        continue;
      }

      // Determine score and criteria_scores: support section-based format (intro/introMark, main/mainMark, etc.)
      const hasSectionMarks = Object.keys(grade).some((k) => k.endsWith("Mark") && typeof grade[k] === "number");
      let totalScore: number;
      let criteriaScores: Record<string, unknown>;

      if (hasSectionMarks) {
        const parsed = parseSectionBasedGrade(grade as Record<string, unknown>);
        totalScore = parsed.score;
        criteriaScores = parsed.criteriaScores;
      } else {
        totalScore = typeof score === "number" ? score : 0;
        let processedGoodComments = goodComments;
        let processedBadComments = badComments;
        if (Array.isArray(goodComments)) processedGoodComments = goodComments.join(" ");
        if (Array.isArray(badComments)) processedBadComments = badComments.join(" ");
        criteriaScores = {
          goodComments: processedGoodComments || "",
          badComments: processedBadComments || "",
        };
      }

      // Check if this paper already has a grade to prevent duplicate processing
      const existingGrade = await prisma.grade.findUnique({
        where: { paper_id: paper.id },
      });

      if (existingGrade) {
        logger.debug(
          { filename: paper.original_filename },
          "Paper already has grade, skipping duplicate"
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
          total_score: totalScore,
          criteria_scores: criteriaScores as object,
        },
      });

      logger.info(
        { gradeId: gradeResult.id, filename: paper.original_filename },
        "Created grade for paper"
      );
    }

    // Sequential processing: trigger next paper for each unique submission (ONCE PER SUBMISSION)
    const processedSubmissions = new Set<string>();

    // Collect unique submission IDs from the papers that were just graded
    for (const grade of grades) {
      const resolvedPaperId = grade.dbPaperId || grade.db_paper_id || grade.paperId;
      const resolvedSubmissionId = grade.dbSubmissionId || grade.db_submission_id || grade.submissionId;

      // Find the paper that was just graded using the same logic as above
      let paper = null;

      // Strategy 1: Use paperId/dbPaperId if provided
      if (resolvedPaperId) {
        paper = await prisma.paper.findUnique({
          where: { id: resolvedPaperId },
        });
      }

      // Strategy 2: Use originalFilename if provided
      if (!paper && grade.originalFilename) {
        paper = await prisma.paper.findFirst({
          where: { original_filename: grade.originalFilename },
          orderBy: { created_at: "desc" },
        });
      }

      // Strategy 3: Use submissionId - find oldest ungraded paper (sequential processing)
      if (!paper && resolvedSubmissionId) {
        const submissionIdToUse = resolvedSubmissionId;
        const submissionPapers = await prisma.paper.findMany({
          where: { submission_id: submissionIdToUse },
          orderBy: { created_at: "asc" },
        });
        const gradedPaperIds = new Set(
          (await prisma.grade.findMany({
            where: { paper_id: { in: submissionPapers.map((p) => p.id) } },
            select: { paper_id: true },
          })).map((g) => g.paper_id)
        );
        paper = submissionPapers.find((p) => !gradedPaperIds.has(p.id)) ?? null;
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
        logger.debug(
          { submissionId: paper.submission_id },
          "Added submission to sequential processing queue"
        );
      } else {
        logger.debug("Could not find paper for grade, skipping sequential processing");
      }
    }

    logger.info(
      { count: processedSubmissions.size },
      "Processing unique submissions for sequential grading"
    );

    // Process each unique submission once
    for (const submissionId of processedSubmissions) {
      const triggered = await triggerNextPaper(submissionId);
      if (triggered) continue;

      // No next paper to send - check if all are graded, then mark completed
      const submissionPapers = await prisma.paper.findMany({
        where: { submission_id: submissionId },
      });
      const gradedCount = await prisma.grade.count({
        where: { submission_id: submissionId },
      });
      if (gradedCount >= submissionPapers.length) {
        // All papers graded, mark submission as completed and cleanup buffers
        await prisma.submission.update({
          where: { id: submissionId },
          data: { status: "COMPLETED" },
        });
        cleanupSubmissionBuffers(submissionId);
        logger.info({ submissionId }, "All papers graded for submission");

        // Notify teacher when grading completes
        const submissionWithUser = await prisma.submission.findUnique({
          where: { id: submissionId },
          include: { submitted_by: true, tbl_papers: true },
        });
        const paperCount = submissionWithUser?.tbl_papers?.length ?? 0;
        if (submissionWithUser?.submitted_by?.email && paperCount > 0) {
          const appUrl = process.env.APP_URL || "http://localhost:5173";
          await sendGradingCompleteEmail(
            submissionWithUser.submitted_by.email,
            submissionWithUser.submitted_by.name,
            paperCount,
            `${appUrl}/results`
          );
        }
      }
    }

    res.json({ success: true, message: `Processed ${grades.length} grade(s)` });
  } catch (error: any) {
    logger.error({ err: error }, "n8n-grades error");
    res.status(500).json({
      error: sanitizeErrorMessage(error.message, "Failed to process grades"),
    });
  }
});

// GET /api/submissions/:id/status - Get grading progress (for UX polling)
router.get(
  "/submissions/:id/status",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const submissionId = req.params.id;
      if (!submissionId) {
        return res.status(400).json({ error: "Submission ID is required" });
      }

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { tbl_papers: { select: { id: true } } },
      });

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      const userRole = req.user?.role;
      const userId = req.user?.userId;
      if (userRole === "TEACHER" && submission.submitted_by_id !== userId) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const totalPapers = submission.tbl_papers.length;
      const gradedCount = await prisma.grade.count({
        where: { submission_id: submissionId },
      });

      res.json({
        submissionId,
        status: submission.status,
        totalPapers,
        gradedCount,
        isComplete: submission.status === "COMPLETED" || gradedCount >= totalPapers,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Submission status error");
      res.status(500).json({ error: "Failed to fetch submission status" });
    }
  }
);

// POST /api/submissions/:submissionId/retry - Retry grading for next ungraded paper
router.post(
  "/submissions/:submissionId/retry",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const submissionId = req.params.submissionId;
      if (!submissionId) {
        return res.status(400).json({ error: "Submission ID is required" });
      }

      const submission = await prisma.submission.findUnique({
        where: { id: submissionId },
        include: { tbl_papers: true },
      });

      if (!submission) {
        return res.status(404).json({ error: "Submission not found" });
      }

      if (submission.status === "COMPLETED") {
        return res.status(400).json({ error: "Submission already completed. Cannot retry." });
      }

      const userRole = req.user?.role;
      const userId = req.user?.userId;
      if (userRole === "TEACHER" && submission.submitted_by_id !== userId) {
        return res.status(403).json({ error: "You can only retry your own submissions" });
      }

      const fileBuffers = fileBufferCache.get(submissionId);
      if (!fileBuffers) {
        return res.status(400).json({
          error: "File buffers no longer available. Retry only works while grading is in progress.",
        });
      }

      const success = await triggerNextPaper(submissionId);
      if (success) {
        logger.info({ submissionId }, "Retry triggered successfully");
        return res.json({ success: true, message: "Grading retry triggered" });
      }

      const gradedCount = await prisma.grade.count({
        where: { submission_id: submissionId },
      });
      if (gradedCount >= submission.tbl_papers.length) {
        return res.json({ success: false, message: "All papers already graded" });
      }

      return res.status(500).json({ error: "Failed to trigger retry" });
    } catch (error: any) {
      logger.error({ err: error }, "Retry error");
      res.status(500).json({
        error: sanitizeErrorMessage(error.message, "Retry failed"),
      });
    }
  }
);

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

      logger.debug(
        { userRole, userId, classId, subjectId },
        "Fetching grades"
      );

      const rows = (await prisma.$queryRawUnsafe<any[]>(
        query,
        ...params
      )) as any[];

      const grades = rows.map((row) => {
        const cs = (row.criteria_scores || {}) as Record<string, unknown>;
        return {
          id: row.grade_id,
          studentName: row.student_name,
          score: Number(row.total_score),
          goodComments: cs.goodComments || "",
          badComments: cs.badComments || "",
          sections: cs.sections || null,
          gradedAt: row.graded_at,
          paperFilename: row.original_filename,
          uploadedAt: row.uploaded_at,
          subjectId: row.subject_id,
          subjectName: row.subject_name,
          subjectCode: row.subject_code,
          classId: row.class_id,
        };
      });

      logger.debug({ count: grades.length }, "Returning grades");

      res.json({ grades });
    } catch (error: any) {
      logger.error({ err: error }, "Grades fetch error");
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch grades" });
    }
  }
);

// GET /api/grades/export - Export grades as CSV or Excel
router.get(
  "/grades/export",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { subjectId, classId, format } = req.query;
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      let query = `
      SELECT 
        g.student_name,
        g.total_score,
        g.criteria_scores,
        g.created_at as graded_at,
        p.original_filename,
        sj.name as subject_name,
        sj.code as subject_code
      FROM tbl_grades g
      JOIN tbl_papers p ON g.paper_id = p.id
      LEFT JOIN tbl_subjects sj ON p.subject_id = sj.id
      LEFT JOIN tbl_class_subjects cs ON sj.id = cs.subject_id
      LEFT JOIN tbl_classes c ON cs.class_id = c.id
    `;

      const conditions = [];
      const params = [];
      let paramIndex = 1;

      if (userRole === "TEACHER") {
        conditions.push(`c.teacher_id = $${paramIndex}::uuid`);
        params.push(userId);
        paramIndex++;
      }
      if (classId) {
        conditions.push(`cs.class_id = $${paramIndex}::uuid`);
        params.push(classId);
        paramIndex++;
      }
      if (subjectId) {
        conditions.push(`sj.id = $${paramIndex}::uuid`);
        params.push(subjectId);
        paramIndex++;
      }
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(" AND ")}`;
      }
      query += ` ORDER BY g.created_at DESC`;

      const rows = (await prisma.$queryRawUnsafe<any[]>(query, ...params)) as any[];

      const exportFormat = (format as string) || "csv";
      const cs = (r: any) => r.criteria_scores || {};
      const goodComments = (r: any) => {
        const c = cs(r);
        if (c.goodComments) return c.goodComments;
        const sections = c.sections as Array<{ name: string; feedback: string; mark: number }> | undefined;
        return sections?.map((s) => `${s.name} (${s.mark}): ${s.feedback}`).join("\n\n") || "";
      };
      const badComments = (r: any) => cs(r).badComments || "";

      if (exportFormat === "xlsx" || exportFormat === "excel") {
        const XLSX = await import("xlsx");
        const data = rows.map((r) => ({
          "Student Name": r.student_name,
          "Score": Number(r.total_score),
          "Subject": r.subject_name,
          "Code": r.subject_code,
          "Filename": r.original_filename,
          "Graded At": r.graded_at ? new Date(r.graded_at).toISOString() : "",
          "Good Comments": goodComments(r),
          "Bad Comments": badComments(r),
        }));
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Grades");
        const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="grades-${new Date().toISOString().slice(0, 10)}.xlsx"`);
        res.send(buf);
      } else {
        const headers = ["Student Name", "Score", "Subject", "Code", "Filename", "Graded At", "Good Comments", "Bad Comments"];
        const escapeCsv = (v: string) => {
          const s = String(v ?? "");
          return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csvRows = [
          headers.join(","),
          ...rows.map((r) =>
            [
              escapeCsv(r.student_name),
              Number(r.total_score),
              escapeCsv(r.subject_name),
              escapeCsv(r.subject_code),
              escapeCsv(r.original_filename),
              r.graded_at ? new Date(r.graded_at).toISOString() : "",
              escapeCsv(goodComments(r)),
              escapeCsv(badComments(r)),
            ].join(",")
          ),
        ];
        const csv = csvRows.join("\n");
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="grades-${new Date().toISOString().slice(0, 10)}.csv"`);
        res.send(csv);
      }
    } catch (error: any) {
      logger.error({ err: error }, "Grades export error");
      res.status(500).json({ error: error.message || "Failed to export grades" });
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
      const { goodComments, badComments, comprehensiveFeedback, sections } = req.body;

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

      const updateData: { criteria_scores?: object; comments?: string } = {};
      const existingCs = (grade.criteria_scores || {}) as Record<string, unknown>;

      // Exam project grades: update comprehensiveFeedback
      if (comprehensiveFeedback && typeof comprehensiveFeedback === "object") {
        updateData.comments = JSON.stringify(comprehensiveFeedback);
      }

      // Section-based grades: update sections array
      if (sections && Array.isArray(sections)) {
        updateData.criteria_scores = { ...existingCs, sections };
      }
      // Paper grades: update goodComments/badComments
      else if (goodComments !== undefined || badComments !== undefined) {
        const updatedCriteriaScores = {
          ...existingCs,
          goodComments: goodComments !== undefined ? goodComments : existingCs.goodComments || "",
          badComments: badComments !== undefined ? badComments : existingCs.badComments || "",
        };
        updateData.criteria_scores = updatedCriteriaScores;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No feedback data provided" });
      }

      const updatedGrade = await prisma.grade.update({
        where: { id },
        data: updateData,
      });

      logger.info({ gradeId: id }, "Updated feedback for grade");

      const result: Record<string, unknown> = {
        success: true,
        message: "Feedback updated successfully",
        grade: { id: updatedGrade.id },
      };
      if (updateData.criteria_scores) {
        const ucs = updateData.criteria_scores as Record<string, unknown>;
        (result.grade as any).goodComments = ucs.goodComments;
        (result.grade as any).badComments = ucs.badComments;
        (result.grade as any).sections = ucs.sections;
      }
      if (updateData.comments) {
        (result.grade as any).comprehensiveFeedback = JSON.parse(updateData.comments);
      }

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Error updating feedback");
      res
        .status(500)
        .json({ error: error.message || "Failed to update feedback" });
    }
  }
);

// GET /api/subjects - Get all subjects (ADMIN) or only subjects in teacher's classes (TEACHER)
router.get(
  "/subjects",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      let rows: any[];
      if (userRole === "TEACHER" && userId) {
        rows = (await prisma.$queryRawUnsafe<any[]>(
          `SELECT DISTINCT s.id, s.name, s.code, s.created_at
           FROM tbl_subjects s
           JOIN tbl_class_subjects cs ON s.id = cs.subject_id
           JOIN tbl_classes c ON cs.class_id = c.id
           WHERE c.teacher_id = $1::uuid
           ORDER BY s.name ASC`,
          userId
        )) as any[];
      } else {
        rows = (await prisma.$queryRawUnsafe<any[]>(
          `SELECT id, name, code, created_at FROM tbl_subjects ORDER BY name ASC`
        )) as any[];
      }
      res.json({ subjects: rows });
    } catch (error: any) {
      logger.error({ err: error }, "Subjects fetch error");
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch subjects" });
    }
  }
);

// POST /api/subjects - Create new subject (Admin only)
router.post(
  "/subjects",
  authenticateToken,
  checkRole(["ADMIN"]),
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
      logger.error({ err: error }, "Subjects create error");
      res
        .status(500)
        .json({ error: error.message || "Failed to create subject" });
    }
  }
);

// GET /api/dashboard/stats - Get dashboard statistics (Admin and Teacher only)
router.get(
  "/dashboard/stats",
  authenticateToken,
  checkRole(["ADMIN", "TEACHER"]),
  async (req: Request, res: Response) => {
    try {
      logger.debug("Fetching dashboard statistics");

      const userRole = req.user?.role;
      const userId = req.user?.userId;
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      let totalCourses: number;
      let totalGraded: number;
      let gradedThisWeek: number;
      let studentsGraded: number;

      if (userRole === "TEACHER" && userId) {
        // Teachers: scope stats to their classes only
        const teacherClasses = await prisma.class.findMany({
          where: { teacher_id: userId },
          select: { id: true },
        });
        const classIds = teacherClasses.map((c) => c.id);

        const classSubjects = await prisma.classSubject.findMany({
          where: { class_id: { in: classIds } },
          select: { subject_id: true },
        });
        const subjectIds = [...new Set(classSubjects.map((cs) => cs.subject_id))];

        totalCourses = subjectIds.length;

        const gradeWhere = {
          tbl_papers: {
            subject_id: { in: subjectIds },
          },
        };

        totalGraded = await prisma.grade.count({
          where: gradeWhere,
        });

        gradedThisWeek = await prisma.grade.count({
          where: {
            ...gradeWhere,
            created_at: { gte: weekAgo },
          },
        });

        const uniqueStudents = await prisma.grade.findMany({
          where: gradeWhere,
          select: { student_name: true },
          distinct: ["student_name"],
        });
        studentsGraded = uniqueStudents.length;
      } else {
        // Admins: global stats
        totalCourses = await prisma.subject.count();
        totalGraded = await prisma.grade.count();
        gradedThisWeek = await prisma.grade.count({
          where: { created_at: { gte: weekAgo } },
        });
        const uniqueStudents = await prisma.grade.findMany({
          select: { student_name: true },
          distinct: ["student_name"],
        });
        studentsGraded = uniqueStudents.length;
      }

      const result = {
        totalCourses,
        totalGraded,
        gradedThisWeek,
        studentsGraded,
      };

      logger.debug({ result }, "Dashboard stats");

      res.json(result);
    } catch (error: any) {
      logger.error({ err: error }, "Dashboard stats error");
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
    logger.error({ err: error }, "Health check error");
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
  uploadRateLimiter,
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  examProjectsUpload.fields([
    { name: "rubricFile", maxCount: 1 },
    { name: "questionFile", maxCount: 1 },
    { name: "paperFiles", maxCount: 25 },
  ]),
  async (req: Request, res: Response) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      let rubricFile = files.rubricFile?.[0];
      const questionFile = files.questionFile?.[0];
      const paperFiles = files.paperFiles || [];
      const { subjectName, subjectCode, classId, subjectId: bodySubjectId, questionTemplateId } = req.body;

      if (!rubricFile) {
        return res.status(400).json({ error: "Rubric file (PDF) is required" });
      }

      let questionFileResolved = questionFile;
      if (!questionFileResolved && questionTemplateId) {
        const template = await prisma.rubricTemplate.findUnique({
          where: { id: questionTemplateId },
        });
        if (!template) {
          return res.status(400).json({ error: "Invalid question paper template" });
        }
        const pdfBuffer = await textToPdfBuffer(template.description, template.name);
        questionFileResolved = {
          fieldname: "questionFile",
          originalname: `question-${template.name}.pdf`,
          encoding: "7bit",
          mimetype: "application/pdf",
          buffer: pdfBuffer,
          size: pdfBuffer.length,
        } as Express.Multer.File;
      }

      if (!questionFileResolved) {
        return res.status(400).json({ error: "Question file (PDF) or question paper template is required" });
      }

      if (!paperFiles || paperFiles.length === 0) {
        return res
          .status(400)
          .json({ error: "At least one exam project file is required" });
      }

      logger.info(
        {
          paperCount: paperFiles.length,
          rubricName: rubricFile.originalname,
          questionName: questionFileResolved.originalname,
        },
        "Processing exam projects"
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
        const classData = await prisma.class.findUnique({
          where: { id: classId },
        });

        if (!classData) {
          return res.status(400).json({ error: "Class not found" });
        }

        // Teachers can only upload to classes they're assigned to
        const userRole = req.user?.role;
        const userId = req.user?.userId;
        if (userRole === "TEACHER" && classData.teacher_id !== userId) {
          return res.status(403).json({ error: "Access denied to this class" });
        }

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
        
        logger.debug({ subjectId, classId }, "Verified subject assigned to class");
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
        logger.warn({ err: error }, "Could not create dummy rubric");
      }

      // Create submission
      const submission = await prisma.submission.create({
        data: {
          rubric_id: rubricId,
          ...(req.user?.userId && { submitted_by_id: req.user.userId }),
        },
      });

      await logAudit({
        ...(req.user?.userId && { userId: req.user.userId }),
        action: "UPLOAD_EXAM_PROJECTS",
        resource: "submission",
        resourceId: submission.id,
        details: { paperCount: paperFiles.length, subjectId },
        ...(getClientIp(req) && { ipAddress: getClientIp(req) }),
      });

      // Validate buffers exist (memory storage)
      if (!rubricFile.buffer) {
        throw new Error("Rubric file buffer is missing");
      }
      if (!questionFileResolved.buffer) {
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
        questionBuffer: questionFileResolved.buffer,
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
        questionFileResolved.buffer,
        questionFileResolved.originalname,
        questionFileResolved.mimetype
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

      logger.info(
        { filename: firstPaper.original_filename },
        "Sending first exam project to n8n"
      );

      if (!N8N_EXAM_PROJECTS_WEBHOOK_URL) {
        throw new Error("Missing N8N_EXAM_PROJECTS_WEBHOOK_URL in environment");
      }

      const n8nResponse = await fetch(N8N_EXAM_PROJECTS_WEBHOOK_URL, {
        method: "POST",
        body: formData,
        headers: getN8nRequestHeaders(),
      });

      if (!n8nResponse.ok) {
        throw new Error(`n8n request failed: ${n8nResponse.statusText}`);
      }

      const n8nResult = await n8nResponse.text();
      logger.debug({ n8nResult }, "Exam projects n8n response");

      res.json({
        submissionId: submission.id,
        totalPapers: paperFiles.length,
        message: "Exam projects submitted for grading",
        firstPaperId: firstPaper.id,
      });
    } catch (error: any) {
      logger.error({ err: error }, "Exam projects error");
      res.status(500).json({
        error: sanitizeErrorMessage(
          error.message,
          "Failed to process exam projects"
        ),
      });
    }
  }
);

// POST /api/exam-projects/n8n/grades - Callback from n8n for exam project grades
router.post(
  "/exam-projects/n8n/grades",
  authenticateWebhook,
  async (req: Request, res: Response) => {
    try {
      let body = req.body;
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: "Invalid grades data format" });
        }
      }
      if (!body || typeof body !== "object") {
        return res.status(400).json({ error: "Invalid grades data format" });
      }

      // n8n sometimes wraps in .body or .json (from Code node output)
      const data =
        body.body !== undefined ? body.body :
        body.json !== undefined ? body.json :
        body;

      // Handle multiple formats: {grades: [...]}, [{grades: [...]}], or direct array of grade objects
      let grades;
      if (data?.grades && Array.isArray(data.grades)) {
        grades = data.grades;
      } else if (data?.body && Array.isArray(data.body)) {
        grades = data.body;
      } else if (data?.json && Array.isArray(data.json)) {
        grades = data.json;
      } else if (Array.isArray(data) && data.length > 0) {
        if (data[0]?.grades && Array.isArray(data[0].grades)) {
          grades = data[0].grades;
        } else if (data[0]?.studentName) {
          grades = data;
        } else {
          return res.status(400).json({ error: "Invalid grades data format" });
        }
      } else if (data?.studentName) {
        grades = [data];
      } else {
        logger.debug({ bodyKeys: Object.keys(body || {}), dataKeys: Object.keys(data || {}) }, "Exam projects grades: unrecognized format");
        return res.status(400).json({ error: "Invalid grades data format" });
      }

      if (!grades || !Array.isArray(grades)) {
        return res.status(400).json({ error: "Invalid grades data" });
      }

      logger.info({ count: grades.length }, "Received exam project grades");

      const processedSubmissions = new Set<string>();

      for (const grade of grades) {
        const {
          studentName,
          dbPaperId,
          db_paper_id,
          dbSubmissionId,
          db_submission_id,
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
        const resolvedPaperId = dbPaperId || db_paper_id;
        const resolvedSubmissionId = dbSubmissionId || db_submission_id;

        if (!studentName) {
          logger.warn("Skipping grade without student name");
          continue;
        }

        // Find paper: prefer dbPaperId (we send one paper per webhook call, n8n must echo it back)
        let paper = null;
        if (resolvedPaperId) {
          paper = await prisma.paper.findUnique({
            where: { id: resolvedPaperId },
          });
        }
        if (!paper && studentName) {
          paper = await prisma.paper.findFirst({
            where: { student_name: studentName },
            orderBy: { created_at: "desc" },
          });
        }
        if (!paper && resolvedSubmissionId) {
          const submissionPapers = await prisma.paper.findMany({
            where: { submission_id: resolvedSubmissionId },
            orderBy: { created_at: "asc" },
          });
          const gradedIds = new Set(
            (await prisma.grade.findMany({
              where: { paper_id: { in: submissionPapers.map((p) => p.id) } },
              select: { paper_id: true },
            })).map((g) => g.paper_id)
          );
          paper = submissionPapers.find((p) => !gradedIds.has(p.id)) ?? null;
        }
        if (!paper) {
          paper = await prisma.paper.findFirst({
            where: { student_name: "Unknown Student" },
            orderBy: { created_at: "desc" },
          });
          if (paper) {
            await prisma.paper.update({
              where: { id: paper.id },
              data: { student_name: studentName },
            });
          }
        }

        if (!paper) {
          logger.warn({ studentName }, "Paper not found for student");
          continue;
        }

        // Always update the paper's student_name from n8n (we initially set "Unknown Student")
        await prisma.paper.update({
          where: { id: paper.id },
          data: { student_name: studentName },
        });

        // Check if grade already exists
        const existingGrade = await prisma.grade.findUnique({
          where: { paper_id: paper.id },
        });

        if (existingGrade) {
          logger.debug({ studentName }, "Grade already exists, skipping");
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

        logger.info(
          { studentName, totalScore },
          "Created exam grade"
        );

        // Track submission for sequential processing
        processedSubmissions.add(paper.submission_id);
      }

      // Sequential processing: trigger next exam project for each unique submission
      logger.info(
        { count: processedSubmissions.size },
        "Processing unique submissions for sequential exam grading"
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
          logger.info(
            { filename: nextPaper.original_filename },
            "Triggering next exam project"
          );

          // Get file buffers from cache
          const fileBuffers = fileBufferCache.get(submissionId);
          if (!fileBuffers) {
            logger.error(
              { submissionId },
              "File buffers not found for submission"
            );
            continue;
          }

          const paperBuffer = fileBuffers.paperBuffers.get(nextPaper.id);
          if (!paperBuffer) {
            logger.error(
              { paperId: nextPaper.id },
              "Paper buffer not found"
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

          if (!N8N_EXAM_PROJECTS_WEBHOOK_URL) {
            throw new Error("Missing N8N_EXAM_PROJECTS_WEBHOOK_URL in environment");
          }

          const n8nResponse = await fetch(N8N_EXAM_PROJECTS_WEBHOOK_URL, {
            method: "POST",
            body: formData,
            headers: getN8nRequestHeaders(),
          });

          if (n8nResponse.ok) {
            logger.info(
              { filename: nextPaper.original_filename },
              "Successfully triggered next exam project"
            );
          } else {
            logger.error(
              { statusText: n8nResponse.statusText },
              "Failed to trigger next exam project"
            );
          }
        } else {
          // All exam projects graded, mark submission as completed and cleanup buffers
          await prisma.submission.update({
            where: { id: submissionId },
            data: { status: "COMPLETED" },
          });
          cleanupSubmissionBuffers(submissionId);
          logger.info({ submissionId }, "All exam projects graded for submission");

          const submissionWithUser = await prisma.submission.findUnique({
            where: { id: submissionId },
            include: { submitted_by: true, tbl_papers: true },
          });
          const paperCount = submissionWithUser?.tbl_papers?.length ?? 0;
          if (submissionWithUser?.submitted_by?.email && paperCount > 0) {
            const appUrl = process.env.APP_URL || "http://localhost:5173";
            await sendGradingCompleteEmail(
              submissionWithUser.submitted_by.email,
              submissionWithUser.submitted_by.name,
              paperCount,
              `${appUrl}/exam-project-results`
            );
          }
        }
      }

      res.json({ message: "Exam project grades processed successfully" });
    } catch (error: any) {
      logger.error({ err: error }, "Exam grades error");
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
      const userRole = req.user?.role;
      const userId = req.user?.userId;

      let subjectIdsFilter: string[] | undefined;
      if (userRole === "TEACHER" && userId) {
        const teacherClasses = await prisma.class.findMany({
          where: { teacher_id: userId },
          select: { id: true },
        });
        const classIds = teacherClasses.map((c) => c.id);
        const classSubjects = await prisma.classSubject.findMany({
          where: { class_id: { in: classIds } },
          select: { subject_id: true },
        });
        subjectIdsFilter = [...new Set(classSubjects.map((cs) => cs.subject_id))];
      }

      const whereClause: Record<string, unknown> = {};
      if (userRole === "TEACHER" && subjectIdsFilter) {
        if (subjectIdsFilter.length === 0) {
          whereClause.subject_id = "00000000-0000-0000-0000-000000000000";
        } else if (subjectId) {
          whereClause.subject_id = subjectIdsFilter.includes(subjectId as string)
            ? subjectId
            : "00000000-0000-0000-0000-000000000000";
        } else {
          whereClause.subject_id = { in: subjectIdsFilter };
        }
      } else if (subjectId) {
        whereClause.subject_id = subjectId;
      }

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
          studentName: grade.student_name || grade.tbl_papers.student_name,
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
      logger.error({ err: error }, "Error fetching exam grades");
      res
        .status(500)
        .json({
          error: error.message || "Failed to fetch exam project grades",
        });
    }
  }
);

export default router;
