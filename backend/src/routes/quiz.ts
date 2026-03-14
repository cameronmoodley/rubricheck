import express, { Request, Response } from "express";
import fetch from "node-fetch";
import { PrismaClient } from "@prisma/client";
import * as cheerio from "cheerio";
import { authenticateToken, checkRole, authenticateWebhook } from "../auth/auth";
import { sanitizeErrorMessage } from "../lib/sanitize-error";

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to extract question and answer from HTML using Cheerio
function extractQandA(html: string): { question: string; answer: string } {
  if (!html) return { question: "", answer: "" };

  try {
    const $ = cheerio.load(html);

    // Question
    let question = $(".qtext").text().trim();

    // If still blank, decode escaped CDATA
    if (!question) {
      const qtextHtml = $(".qtext").html() || "";
      const decoded = qtextHtml.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      const cdataMatch = decoded.match(/<!\[CDATA\[(.*?)\]\]>/s);
      if (cdataMatch && cdataMatch[1]) {
        question = cdataMatch[1].trim();
      }
    }

    // If still blank, try direct CDATA extraction from full HTML
    if (!question) {
      const cdataMatch = html.match(
        /<div class="qtext"><!\[CDATA\[(.*?)\]\]><\/div>/s
      );
      if (cdataMatch && cdataMatch[1]) {
        question = cdataMatch[1].trim();
      }
    }

    // Answer
    let answer = $(".qtype_essay_response").text().trim();
    if (!answer) answer = $(".answer").text().trim();

    return {
      question: question || "No question found",
      answer: answer || "No answer provided",
    };
  } catch (err) {
    console.error("extractQandA error:", err);
    return { question: "", answer: "" };
  }
}

// New n8n webhook URL for Moodle quiz grading
const MOODLE_N8N_WEBHOOK_URL = process.env.N8N_MOODLE_WEB_HOOK;

// Moodle API helper function
const makeMoodleRequest = async (
  wsfunction: string,
  additionalParams: Record<string, string> = {}
) => {
  const moodleUrl =
    process.env.MOODLE_WEB_SERVICE_URL ||
    "http://localhost:8081/webservice/rest/server.php";
  const token = process.env.WSTOKEN;

  if (!moodleUrl || !token) {
    throw new Error("Missing Moodle URL or token");
  }

  const formData = new FormData();
  formData.append("wstoken", token);
  formData.append("wsfunction", wsfunction);
  formData.append("moodlewsrestformat", "json");

  Object.entries(additionalParams).forEach(([key, value]) => {
    formData.append(key, value);
  });

  const response = await fetch(moodleUrl, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if ((data as any).exception) {
    throw new Error(
      `Moodle API error: ${(data as any).message || (data as any).errorcode}`
    );
  }

  return data;
};

// GET /api/quiz/questions/:quizId - Get quiz questions and structure
router.get(
  "/questions/:quizId",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { quizId } = req.params;

      if (!quizId) {
        return res.status(400).json({ error: "Quiz ID is required" });
      }

      console.log(`[quiz-questions] Fetching questions for quiz ${quizId}`);

      // Get all courses first
      const courses = await makeMoodleRequest("core_course_get_courses");
      console.log(
        `[quiz-questions] Found ${(courses as any).length || 0} courses`
      );

      // Get quizzes from all courses
      const allQuizzes = [];
      for (let i = 0; i < (courses as any).length; i++) {
        const courseId = (courses as any)[i].id;
        try {
          const quizInfo = await makeMoodleRequest(
            "mod_quiz_get_quizzes_by_courses",
            {
              [`courseids[0]`]: courseId.toString(),
            }
          );
          if ((quizInfo as any).quizzes) {
            allQuizzes.push(...(quizInfo as any).quizzes);
          }
        } catch (error) {
          console.warn(
            `[quiz-questions] Failed to get quizzes for course ${courseId}:`,
            error
          );
        }
      }

      console.log(`[quiz-questions] Found ${allQuizzes.length} quizzes total`);
      console.log(`[quiz-questions] Looking for quiz ID: ${quizId}`);
      console.log(
        `[quiz-questions] Available quiz IDs:`,
        allQuizzes.map((q: any) => q.id)
      );

      const quiz = allQuizzes.find((q: any) => q.id === parseInt(quizId));

      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      // Get questions from a preview attempt to extract all quiz questions
      try {
        // Start a preview attempt to get questions
        const previewAttempt = await makeMoodleRequest(
          "mod_quiz_start_attempt",
          {
            quizid: quizId.toString(),
            preview: "1", // Start a preview attempt
          }
        );

        if (!previewAttempt || !(previewAttempt as any).attempt) {
          throw new Error("Failed to start preview attempt to get questions");
        }

        // Get attempt review to extract questions
        const attemptReview = await makeMoodleRequest(
          "mod_quiz_get_attempt_review",
          {
            attemptid: (previewAttempt as any).attempt.id.toString(),
            page: "-1", // Fetch all pages
          }
        );

        // Extract questions from attemptReview using HTML parsing
        const questions = ((attemptReview as any).questions || []).map(
          (q: any) => {
            const { question } = extractQandA(q.html || "");
            return {
              slot: q.slot,
              type: q.type || "essay",
              questionText: question, // Clean question text
              maxmark: q.maxmark || 0,
            };
          }
        );

        res.json({
          quizId: parseInt(quizId),
          quizInfo: quiz,
          questions: questions,
          message: `Quiz information fetched successfully with ${questions.length} questions`,
        });
      } catch (previewError: any) {
        console.warn(
          `[quiz-questions] Failed to get questions via preview attempt:`,
          previewError
        );

        // Skip the fallback to avoid infinite loops
        console.log(
          `[quiz-questions] Skipping fallback to prevent infinite loop`
        );

        // Final fallback to empty questions
        res.json({
          quizId: parseInt(quizId),
          quizInfo: quiz,
          questions: [],
          message:
            "Quiz information fetched successfully (questions could not be loaded)",
        });
      }
    } catch (error: any) {
      console.error("[quiz-questions] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch quiz questions" });
    }
  }
);

// GET /api/quiz/attempts/:quizId - Get attempts from Moodle (same logic as frontend)
router.get(
  "/attempts/:quizId",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { quizId } = req.params;

      if (!quizId) {
        return res.status(400).json({ error: "Quiz ID is required" });
      }

      console.log(`[quiz-attempts] Fetching attempts for quiz ${quizId}`);

      // First, get the quiz to find its course
      const courses = await makeMoodleRequest("core_course_get_courses");
      const allQuizzes = [];

      for (let i = 0; i < (courses as any).length; i++) {
        const courseId = (courses as any)[i].id;
        try {
          const quizInfo = await makeMoodleRequest(
            "mod_quiz_get_quizzes_by_courses",
            {
              [`courseids[0]`]: courseId.toString(),
            }
          );
          if ((quizInfo as any).quizzes) {
            allQuizzes.push(...(quizInfo as any).quizzes);
          }
        } catch (error) {
          console.warn(
            `[quiz-attempts] Failed to get quizzes for course ${courseId}:`,
            error
          );
        }
      }

      const quiz = allQuizzes.find((q: any) => q.id === parseInt(quizId));
      if (!quiz) {
        return res.status(404).json({ error: "Quiz not found" });
      }

      console.log(
        `[quiz-attempts] Found quiz: ${quiz.name} in course ${quiz.course}`
      );

      // Get enrolled users for this course
      const enrolledUsers = await makeMoodleRequest(
        "core_enrol_get_enrolled_users",
        {
          courseid: quiz.course.toString(),
        }
      );

      console.log(
        `[quiz-attempts] Found ${
          (enrolledUsers as any).length || 0
        } enrolled users`
      );

      if (!enrolledUsers || (enrolledUsers as any).length === 0) {
        return res.json({ attempts: [], message: "No enrolled users found" });
      }

      // Fetch attempts for each user
      const allAttempts = [];
      for (const user of enrolledUsers as any) {
        console.log(
          `[quiz-attempts] Fetching attempts for user ${user.id} (${user.fullname})`
        );

        try {
          const userAttempts = await makeMoodleRequest(
            "mod_quiz_get_user_attempts",
            {
              quizid: quizId,
              userid: user.id.toString(),
              status: "all",
            }
          );

          // Add user info to each attempt
          const attemptsWithUserInfo = (
            (userAttempts as any).attempts || []
          ).map((attempt: any) => ({
            ...attempt,
            userfullname: user.fullname,
            useremail: user.email,
          }));

          allAttempts.push(...attemptsWithUserInfo);
          console.log(
            `[quiz-attempts] Found ${attemptsWithUserInfo.length} attempts for user ${user.id}`
          );
        } catch (error) {
          console.warn(
            `[quiz-attempts] Failed to fetch attempts for user ${user.id}:`,
            error
          );
        }
      }

      console.log(
        `[quiz-attempts] Total attempts found: ${allAttempts.length}`
      );

      res.json({
        attempts: allAttempts,
        totalAttempts: allAttempts.length,
        message: `Found ${allAttempts.length} attempts for quiz ${quizId}`,
      });
    } catch (error: any) {
      console.error("[quiz-attempts] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch quiz attempts" });
    }
  }
);

// GET /api/quiz/attempt-answers/:attemptId - Fetch answers for a specific attempt
router.get(
  "/attempt-answers/:attemptId",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    const attemptIdParam = req.params.attemptId;
    if (!attemptIdParam) {
      return res.status(400).json({ error: "Attempt ID is required" });
    }

    const attemptId = parseInt(attemptIdParam);
    if (isNaN(attemptId)) {
      return res.status(400).json({ error: "Invalid Attempt ID" });
    }

    try {
      // Get attempt review from Moodle
      const attemptReview = (await makeMoodleRequest(
        "mod_quiz_get_attempt_review",
        {
          attemptid: attemptId.toString(),
          page: "-1", // Fetch all pages
        }
      )) as any;

      // Extract answers from attemptReview using HTML parsing
      const answeredQuestions = (attemptReview.questions || []).map(
        (q: any) => {
          // Parse HTML to extract clean question text and answer
          const { question, answer } = extractQandA(q.html || "");

          return {
            slot: q.slot,
            type: q.type || "essay", // Default to essay if not specified
            questionText: question, // Clean question text from HTML
            studentAnswer: answer, // Clean student answer from HTML
            mark: q.mark || null,
            maxmark: q.maxmark || 0,
            answered: true, // This question was answered
            studentId: attemptReview.attempt.userid, // Add student ID
          };
        }
      );

      // Create quizQuestions array with clean text
      const quizQuestions = (attemptReview.questions || []).map((q: any) => {
        const { question, answer } = extractQandA(q.html || "");
        return {
          slot: q.slot,
          type: q.type || "essay",
          question: question,
          answer: answer,
          maxmark: q.maxmark || 0,
        };
      });

      // Get all quiz questions to include unanswered ones
      let allQuestions = [];
      try {
        const questionsResponse = await fetch(
          `http://localhost:8001/api/quiz/questions/${attemptReview.attempt.quiz}`
        );
        const questionsData = (await questionsResponse.json()) as any;

        if (questionsResponse.ok && questionsData.questions) {
          allQuestions = questionsData.questions.map((q: any) => {
            // Check if this question was answered
            const answeredQ = answeredQuestions.find(
              (aq: any) => aq.slot === q.slot
            );

            if (answeredQ) {
              // Return the answered version
              return answeredQ;
            } else {
              // Return unanswered question
              return {
                slot: q.slot,
                type: q.type || "essay",
                questionText: q.questiontext || "",
                studentAnswer: "No answer provided",
                mark: null,
                maxmark: q.maxmark || 0,
                answered: false,
                studentId: attemptReview.attempt.userid, // Add student ID
              };
            }
          });
        }
      } catch (error) {
        console.warn(
          "Failed to fetch all questions, using only answered ones:",
          error
        );
        allQuestions = answeredQuestions;
      }

      const answers = allQuestions;

      res.json({
        attemptId,
        answers,
        quizQuestions, // Add the parsed quiz questions
        attemptReview,
      });
    } catch (error: any) {
      console.error(`Failed to fetch answers for attempt ${attemptId}:`, error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch attempt answers" });
    }
  }
);

// GET /api/quiz/complete-data/:quizId - Get complete quiz data (questions + all attempts with answers)
router.get(
  "/complete-data/:quizId",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { quizId } = req.params;

      if (!quizId) {
        return res.status(400).json({ error: "Quiz ID is required" });
      }

      console.log(`[quiz-complete] Fetching complete data for quiz ${quizId}`);

      // Get quiz questions
      const questionsResponse = await fetch(
        `http://localhost:8001/api/quiz/questions/${quizId}`
      );
      const questionsData = await questionsResponse.json();

      if (!questionsResponse.ok) {
        throw new Error(
          (questionsData as any).error || "Failed to fetch quiz questions"
        );
      }

      // Get all attempts for this quiz
      const attemptsResponse = await fetch(
        `http://localhost:8001/api/quiz/attempts/${quizId}`
      );
      const attemptsData = await attemptsResponse.json();

      if (!attemptsResponse.ok) {
        throw new Error(
          (attemptsData as any).error || "Failed to fetch quiz attempts"
        );
      }

      // Get answers for each attempt
      const attemptsWithAnswers = [];
      for (const attempt of (attemptsData as any).attempts) {
        try {
          const answersResponse = await fetch(
            `http://localhost:8001/api/quiz/attempt-answers/${attempt.id}`
          );
          const answersData = await answersResponse.json();

          if (answersResponse.ok) {
            attemptsWithAnswers.push({
              ...attempt,
              answers: (answersData as any).answers,
              quizQuestions: (answersData as any).quizQuestions, // Add parsed quiz questions
              attemptData: (answersData as any).attemptData,
              attemptReview: (answersData as any).attemptReview,
            });
          } else {
            console.warn(
              `[quiz-complete] Failed to fetch answers for attempt ${attempt.id}:`,
              (answersData as any).error
            );
            attemptsWithAnswers.push({
              ...attempt,
              answers: [],
              error: (answersData as any).error,
            });
          }
        } catch (answerError: any) {
          console.warn(
            `[quiz-complete] Error fetching answers for attempt ${attempt.id}:`,
            answerError
          );
          attemptsWithAnswers.push({
            ...attempt,
            answers: [],
            error: answerError.message,
          });
        }
      }

      res.json({
        quizId: parseInt(quizId),
        quizInfo: (questionsData as any).quizInfo,
        questions: (questionsData as any).questions,
        accessInfo: (questionsData as any).accessInfo,
        attempts: attemptsWithAnswers,
        totalAttempts: attemptsWithAnswers.length,
        message: `Complete quiz data fetched: ${
          (questionsData as any).questions.length
        } questions, ${attemptsWithAnswers.length} attempts`,
      });
    } catch (error: any) {
      console.error("[quiz-complete] Error:", error);
      res
        .status(500)
        .json({ error: error.message || "Failed to fetch complete quiz data" });
    }
  }
);

// POST /api/quiz/grade - Start grading all attempts for a quiz
router.post(
  "/grade",
  authenticateToken,
  checkRole(["TEACHER", "ADMIN"]),
  async (req: Request, res: Response) => {
    try {
      const { quizId, createdBy } = req.body;

      if (!quizId) {
        return res
          .status(400)
          .json({ error: "Missing required field: quizId" });
      }

      console.log(`[quiz-grade] Starting grading for quiz ${quizId}`);

      // First, fetch the quiz and attempts from Moodle
      const attemptsResponse = await fetch(
        `http://localhost:8001/api/quiz/attempts/${quizId}`
      );
      const attemptsData = await attemptsResponse.json();

      if (!attemptsResponse.ok) {
        throw new Error(
          (attemptsData as any).error || "Failed to fetch quiz attempts"
        );
      }

      const attempts = (attemptsData as any).attempts;
      if (!attempts || attempts.length === 0) {
        return res
          .status(400)
          .json({ error: "No attempts found for this quiz" });
      }

      // Get quiz info
      const quizResponse = await fetch(
        `http://localhost:8001/api/quiz/questions/${quizId}`
      );
      const quizData = await quizResponse.json();
      const quizInfo = (quizData as any).quizInfo;

      console.log(
        `[quiz-grade] Starting grading for quiz ${quizId} with ${attempts.length} attempts`
      );

      // Create grading job
      const jobResult = await prisma.$queryRawUnsafe(
        `
      INSERT INTO tbl_quiz_grading_jobs 
      (quiz_id, quiz_name, course_id, course_name, total_attempts, created_by, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING id, created_at
    `,
        quizId,
        quizInfo?.name || `Quiz ${quizId}`,
        quizInfo?.course || 0,
        quizInfo?.coursename || "Unknown Course",
        attempts.length,
        createdBy || "system"
      );

      const jobId = (jobResult as any[])[0]?.id;
      if (!jobId) {
        throw new Error("Failed to create grading job");
      }

      // Cache attempts in database
      for (const attempt of attempts) {
        await prisma.$queryRawUnsafe(
          `
        INSERT INTO tbl_quiz_attempts_cache 
        (quiz_id, attempt_id, user_id, user_data, attempt_data)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
        ON CONFLICT (quiz_id, attempt_id) DO UPDATE SET
          user_data = EXCLUDED.user_data,
          attempt_data = EXCLUDED.attempt_data,
          cached_at = NOW(),
          expires_at = NOW() + INTERVAL '24 hours',
          is_expired = FALSE
      `,
          quizId,
          attempt.id,
          attempt.userid,
          JSON.stringify({
            fullname: attempt.userfullname,
            email: attempt.useremail,
          }),
          JSON.stringify(attempt)
        );
      }

      // Create result records
      for (const attempt of attempts) {
        await prisma.$queryRawUnsafe(
          `
        INSERT INTO tbl_quiz_grading_results 
        (job_id, attempt_id, user_id, user_name, user_email, attempt_number, max_score, grading_status)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'pending')
      `,
          jobId,
          attempt.id,
          attempt.userid,
          attempt.userfullname,
          attempt.useremail,
          attempt.attempt,
          attempt.sumgrades || 0
        );
      }

      // Update job status
      await prisma.$queryRawUnsafe(
        `
      UPDATE tbl_quiz_grading_jobs 
      SET status = 'processing', started_at = NOW()
      WHERE id = $1::uuid
    `,
        jobId
      );

      // Fetch complete quiz data (questions + answers) before sending to n8n
      console.log(
        `[quiz-grade] Fetching complete quiz data for quiz ${quizId}`
      );

      let completeQuizData;
      try {
        const completeDataResponse = await fetch(
          `http://localhost:8001/api/quiz/complete-data/${quizId}`
        );
        completeQuizData = await completeDataResponse.json();

        if (!completeDataResponse.ok) {
          throw new Error(
            (completeQuizData as any).error ||
              "Failed to fetch complete quiz data"
          );
        }

        console.log(
          `[quiz-grade] Fetched ${
            (completeQuizData as any).questions.length
          } questions and ${
            (completeQuizData as any).attempts.length
          } attempts with answers`
        );
      } catch (dataError: any) {
        console.error(
          `[quiz-grade] Failed to fetch complete quiz data:`,
          dataError
        );
        await prisma.$queryRawUnsafe(
          `
        UPDATE tbl_quiz_grading_jobs 
        SET status = 'failed', error_message = $2
        WHERE id = $1::uuid
      `,
          jobId,
          `Failed to fetch quiz data: ${dataError.message}`
        );
        return res
          .status(500)
          .json({ error: `Failed to fetch quiz data: ${dataError.message}` });
      }

      // Get a default rubric for quiz grading
      let defaultRubric = null;
      try {
        const rubricResult = await prisma.rubric.findFirst({
          orderBy: { created_at: "desc" },
        });
        if (rubricResult) {
          defaultRubric = {
            id: rubricResult.id,
            title: rubricResult.title,
            criteria: rubricResult.criteria,
          };
        }
      } catch (rubricError) {
        console.warn(
          "[quiz-grade] Could not fetch default rubric:",
          rubricError
        );
      }

      // Send to n8n for grading
      try {
        const n8nPayload = {
          jobId,
          quizId,
          quizQuestions:
            (completeQuizData as any).attempts[0]?.quizQuestions || [],
          rubric: defaultRubric,
          attempts: (completeQuizData as any).attempts.map((attempt: any) => ({
            attemptId: attempt.id,
            userId: attempt.userid,
            grades:
              attempt.answers?.map((answer: any) => ({
                slot: answer.slot,
                mark: answer.mark || 0, // Default to 0 if not graded yet
              })) || [],
          })),
        };

        console.log(
          `[quiz-grade] Sending ${attempts.length} attempts to n8n for job ${jobId}`
        );

        if (!MOODLE_N8N_WEBHOOK_URL) {
          throw new Error("N8N_MOODLE_WEB_HOOK environment variable not set");
        }

        const n8nResponse = await fetch(MOODLE_N8N_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(n8nPayload),
        });

        if (!n8nResponse.ok) {
          throw new Error(`n8n request failed: ${n8nResponse.statusText}`);
        }

        const n8nResult = await n8nResponse.text();
        console.log(`[quiz-grade] n8n response: ${n8nResult}`);

        res.json({
          success: true,
          jobId,
          message: `Grading started for ${attempts.length} attempts`,
          n8nResponse: n8nResult,
        });
      } catch (n8nError: any) {
        console.error(`[quiz-grade] n8n error:`, n8nError);
        await prisma.$queryRawUnsafe(
          `
        UPDATE tbl_quiz_grading_jobs 
        SET status = 'failed', error_message = $2
        WHERE id = $1::uuid
      `,
          jobId,
          `n8n error: ${n8nError.message}`
        );
        res.status(500).json({
          error: sanitizeErrorMessage(
            n8nError.message,
            "Failed to start grading"
          ),
        });
      }
    } catch (error: any) {
      console.error("[quiz-grade] Error:", error);
      res.status(500).json({
        error: sanitizeErrorMessage(error.message, "Failed to start grading"),
      });
    }
  }
);

// POST /api/n8n/quiz-grades - Callback from n8n for quiz grading results
router.post("/n8n/quiz-grades", authenticateWebhook, async (req: Request, res: Response) => {
  try {
    console.log("[n8n-quiz-grades] Received grading results from n8n");
    console.log(
      "[n8n-quiz-grades] Request body:",
      JSON.stringify(req.body, null, 2)
    );

    const { jobId, results } = req.body;

    if (!jobId || !results || !Array.isArray(results)) {
      return res.status(400).json({ error: "Missing jobId or results array" });
    }

    console.log(
      `[n8n-quiz-grades] Processing ${results.length} results for job ${jobId}`
    );

    // Update each result
    for (const result of results) {
      const { attemptId, score, feedback, goodComments, badComments } = result;

      await prisma.$queryRawUnsafe(
        `
        UPDATE tbl_quiz_grading_results 
        SET 
          grading_status = 'graded',
          score = $2,
          good_comments = $3,
          bad_comments = $4,
          graded_at = NOW()
        WHERE job_id = $1::uuid AND attempt_id = $5
      `,
        jobId,
        score,
        goodComments,
        badComments,
        attemptId
      );

      console.log(`[n8n-quiz-grades] Updated result for attempt ${attemptId}`);
    }

    // Update job status
    await prisma.$queryRawUnsafe(
      `
      UPDATE tbl_quiz_grading_jobs 
      SET 
        status = 'completed',
        completed_at = NOW()
      WHERE id = $1::uuid
    `,
      jobId
    );

    console.log(`[n8n-quiz-grades] Completed grading job ${jobId}`);

    res.json({
      success: true,
      message: `Processed ${results.length} grading results for job ${jobId}`,
    });
  } catch (error: any) {
    console.error("[n8n-quiz-grades] Error:", error);
    res.status(500).json({
      error: sanitizeErrorMessage(
        error.message,
        "Failed to process quiz grades"
      ),
    });
  }
});

export default router;
