import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
} from "@mui/material";
import { BarChart, Assessment } from "@mui/icons-material";
import { useParams, useNavigate } from "react-router-dom";
import { HIDE_MOODLE } from "./config";
import { apiUrl } from "./lib/api";

type MoodleCourse = { id: number; fullname: string; shortname: string };
type MoodleQuiz = {
  id: number;
  course: number;
  name: string;
  grade: number;
  attempts: number;
  timelimit: number;
};
type QuizAttempt = {
  id: number;
  userid: number;
  attempt: number;
  timestart: number;
  timefinish: number;
  state: string;
  sumgrades: number;
  userfullname?: string;
  useremail?: string;
};

export default function QuizDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const quizId = id ? parseInt(id, 10) : null;

  useEffect(() => {
    if (HIDE_MOODLE) navigate("/", { replace: true });
  }, [navigate]);

  if (HIDE_MOODLE) return null;
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [quizzes, setQuizzes] = useState<MoodleQuiz[]>([]);
  const [selectedQuiz, setSelectedQuiz] = useState<MoodleQuiz | null>(null);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [loadingAttempts, setLoadingAttempts] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);

  const makeMoodleRequest = async (wsfunction: string, params: Record<string, string> = {}) => {
    if (HIDE_MOODLE) throw new Error("Moodle disabled");
    const moodleUrl = import.meta.env.VITE_MOODLE_WEB_SERVICE_URL;
    const token = import.meta.env.VITE_WSTOKEN;
    if (!moodleUrl || !token) throw new Error("Missing Moodle URL or token");
    const formData = new FormData();
    formData.append("wstoken", token);
    formData.append("wsfunction", wsfunction);
    formData.append("moodlewsrestformat", "json");
    Object.entries(params).forEach(([k, v]) => formData.append(k, v));
    const res = await fetch(moodleUrl, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  const fetchCourses = async () => {
    try {
      setLoadingCourses(true);
      const data = await makeMoodleRequest("core_course_get_courses");
      setCourses(data || []);
    } catch {
      setCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  };

  const fetchQuizzes = async () => {
    try {
      setLoadingQuizzes(true);
      const data = await makeMoodleRequest("core_course_get_courses");
      const allQuizzes: MoodleQuiz[] = [];
      for (const course of data || []) {
        if (course.id === 1) continue;
        try {
          const quizData = await makeMoodleRequest("mod_quiz_get_quizzes_by_courses", { "courseids[0]": course.id.toString() });
          if (quizData?.quizzes) allQuizzes.push(...quizData.quizzes);
        } catch {}
      }
      setQuizzes(allQuizzes);
    } catch {
      setQuizzes([]);
    } finally {
      setLoadingQuizzes(false);
    }
  };

  const fetchQuizAttempts = async (qId: number) => {
    const quiz = quizzes.find((q) => q.id === qId);
    if (!quiz) return;
    try {
      setLoadingAttempts(true);
      const enrolledUsers = await makeMoodleRequest("core_enrol_get_enrolled_users", { courseid: quiz.course.toString() });
      const allAttempts: QuizAttempt[] = [];
      for (const user of enrolledUsers || []) {
        const data = await makeMoodleRequest("mod_quiz_get_user_attempts", {
          quizid: qId.toString(),
          userid: user.id.toString(),
        });
        const attempts = (data.attempts || []).map((a: QuizAttempt) => ({
          ...a,
          userfullname: user.fullname,
          useremail: user.email,
        }));
        allAttempts.push(...attempts);
      }
      setQuizAttempts(allAttempts);
    } catch {
      setQuizAttempts([]);
    } finally {
      setLoadingAttempts(false);
    }
  };

  const startGrading = async () => {
    if (!selectedQuiz || !quizId) return;
    try {
      setLoadingAction(true);
      const res = await fetch(apiUrl("/api/quiz/grade"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId: quizId, createdBy: "frontend-user" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start grading");
      alert(`Grading started! Job ID: ${data.jobId}. Check the grading status.`);
    } catch (e) {
      alert(`Failed to start grading: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoadingAction(false);
    }
  };

  const fetchCompleteData = async () => {
    if (!quizId) return;
    try {
      setLoadingAction(true);
      const res = await fetch(apiUrl(`/api/quiz/complete-data/${quizId}`));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setQuizAttempts(data.attempts || []);
    } catch (e) {
      alert(`Failed to fetch: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoadingAction(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  useEffect(() => {
    if (courses.length > 0) fetchQuizzes();
  }, [courses]);

  useEffect(() => {
    if (quizId && quizzes.length > 0) {
      const quiz = quizzes.find((q) => q.id === quizId);
      if (quiz) {
        setSelectedQuiz(quiz);
        fetchQuizAttempts(quizId);
      }
    }
  }, [quizId, quizzes]);

  const course = selectedQuiz ? courses.find((c) => c.id === selectedQuiz.course) : null;

  const isLoading = loadingCourses || loadingQuizzes || loadingAttempts;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {selectedQuiz ? selectedQuiz.name : "Quiz Details"}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {selectedQuiz && course
          ? `Course: ${course.fullname || course.shortname}`
          : "Manage quiz attempts and grading"}
      </Typography>

      {isLoading && (
        <Card sx={{ mb: 3 }}>
          <CardContent sx={{ textAlign: "center", py: 4 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography>Loading quiz data from Moodle...</Typography>
          </CardContent>
        </Card>
      )}

      {selectedQuiz && !isLoading && (
        <>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Quiz Information</Typography>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
                <Box><Typography variant="body2" color="text.secondary">Quiz Name</Typography><Typography fontWeight={500}>{selectedQuiz.name}</Typography></Box>
                <Box><Typography variant="body2" color="text.secondary">Course</Typography><Typography fontWeight={500}>{course?.fullname || course?.shortname || `ID: ${selectedQuiz.course}`}</Typography></Box>
                <Box><Typography variant="body2" color="text.secondary">Grade</Typography><Typography fontWeight={500}>{selectedQuiz.grade}</Typography></Box>
                <Box><Typography variant="body2" color="text.secondary">Attempts Allowed</Typography><Typography fontWeight={500}>{selectedQuiz.attempts}</Typography></Box>
                <Box><Typography variant="body2" color="text.secondary">Time Limit</Typography><Typography fontWeight={500}>{selectedQuiz.timelimit > 0 ? `${selectedQuiz.timelimit} min` : "No limit"}</Typography></Box>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Actions</Typography>
              <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <Button variant="contained" startIcon={<BarChart />} disabled={loadingAction} onClick={() => fetchCompleteData()}>
                  {loadingAction ? "Loading..." : "Refresh Complete Data"}
                </Button>
                <Button variant="contained" color="secondary" startIcon={<Assessment />} disabled={loadingAction} onClick={startGrading}>
                  {loadingAction ? "Processing..." : "Grade All Attempts"}
                </Button>
              </Box>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Quiz Attempts ({quizAttempts.length})</Typography>
              {quizAttempts.length > 0 ? (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Student</strong></TableCell>
                        <TableCell><strong>Email</strong></TableCell>
                        <TableCell><strong>State</strong></TableCell>
                        <TableCell><strong>Score</strong></TableCell>
                        <TableCell><strong>Started</strong></TableCell>
                        <TableCell><strong>Finished</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {quizAttempts.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.userfullname || `User ${a.userid}`}</TableCell>
                          <TableCell>{a.useremail || "N/A"}</TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={a.state}
                              color={a.state === "finished" ? "success" : a.state === "inprogress" ? "warning" : "default"}
                            />
                          </TableCell>
                          <TableCell>{a.sumgrades ?? "N/A"}</TableCell>
                          <TableCell>{a.timestart ? new Date(a.timestart * 1000).toLocaleString() : "N/A"}</TableCell>
                          <TableCell>{a.timefinish ? new Date(a.timefinish * 1000).toLocaleString() : "N/A"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              ) : (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No attempts found</Typography>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
