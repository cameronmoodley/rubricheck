import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  InputAdornment,
  CircularProgress,
} from "@mui/material";
import { Search, Edit } from "@mui/icons-material";
import { useNavigate, useSearchParams } from "react-router-dom";
import { HIDE_MOODLE } from "./config";

type MoodleCourse = {
  id: number;
  fullname: string;
  shortname: string;
  categoryid: number;
  categoryname: string;
  visible: number;
};

type MoodleQuiz = {
  id: number;
  course: number;
  coursemodule: number;
  name: string;
  intro: string;
  introformat: number;
  timeopen: number;
  timeclose: number;
  timelimit: number;
  attempts: number;
  grademethod: number;
  decimalpoints: number;
  questiondecimalpoints: number;
  sumgrades: number;
  grade: number;
  hasfeedback: number;
  section: number;
  visible: number;
  groupmode: number;
  groupingid: number;
};

export default function QuizPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [quizzes, setQuizzes] = useState<MoodleQuiz[]>([]);
  const [, setLoadingCourses] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (HIDE_MOODLE) navigate("/", { replace: true });
  }, [navigate]);

  const makeMoodleRequest = async (wsfunction: string, additionalParams: Record<string, string> = {}) => {
    if (HIDE_MOODLE) throw new Error("Moodle disabled");
    const moodleUrl = import.meta.env.VITE_MOODLE_WEB_SERVICE_URL;
    const token = import.meta.env.VITE_WSTOKEN;
    if (!moodleUrl || !token) throw new Error("Missing Moodle URL or token");
    const formData = new FormData();
    formData.append("wstoken", token);
    formData.append("wsfunction", wsfunction);
    formData.append("moodlewsrestformat", "json");
    Object.entries(additionalParams).forEach(([k, v]) => formData.append(k, v));
    const res = await fetch(moodleUrl, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  useEffect(() => {
    if (HIDE_MOODLE) return;
    const courseParam = searchParams.get("course");
    if (courseParam) {
      setLoadingCourses(true);
      makeMoodleRequest("core_course_get_courses")
        .then((data) => setCourses(data || []))
        .catch(() => setCourses([]))
        .finally(() => setLoadingCourses(false));
    } else {
      makeMoodleRequest("core_course_get_courses")
        .then((data) => setCourses(data || []))
        .catch(() => setCourses([]));
    }
  }, [searchParams]);

  useEffect(() => {
    if (HIDE_MOODLE || courses.length === 0) {
      if (courses.length === 0) setQuizzes([]);
      return;
    }
    setLoadingQuizzes(true);
    const formData = new FormData();
    formData.append("wstoken", import.meta.env.VITE_WSTOKEN);
    formData.append("wsfunction", "mod_quiz_get_quizzes_by_courses");
    formData.append("moodlewsrestformat", "json");
    courses.forEach((c, i) => formData.append(`courseids[${i}]`, c.id.toString()));
    fetch(import.meta.env.VITE_MOODLE_WEB_SERVICE_URL, { method: "POST", body: formData })
      .then((r) => r.json())
      .then((d) => setQuizzes(d.quizzes || []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoadingQuizzes(false));
  }, [courses]);

  if (HIDE_MOODLE) return null;

  const filteredQuizzes = quizzes.filter((quiz) => {
    const course = courses.find((c) => c.id === quiz.course);
    const courseName = course?.fullname || course?.shortname || "";
    const quizName = quiz.name || "";
    const searchLower = searchTerm.toLowerCase();
    return (
      courseName.toLowerCase().includes(searchLower) ||
      quizName.toLowerCase().includes(searchLower) ||
      quiz.id.toString().includes(searchLower)
    );
  });

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Quiz</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Select and manage Moodle quizzes for AI-powered grading
      </Typography>

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Available Quizzes ({filteredQuizzes.length})</Typography>
            <TextField
              size="small"
              placeholder="Search quizzes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              sx={{ maxWidth: 300 }}
            />
          </Box>

          {loadingQuizzes ? (
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, py: 4 }}>
              <CircularProgress size={24} />
              <Typography color="text.secondary">Loading quizzes...</Typography>
            </Box>
          ) : filteredQuizzes.length > 0 ? (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Quiz Name</strong></TableCell>
                    <TableCell><strong>Course</strong></TableCell>
                    <TableCell><strong>Grade</strong></TableCell>
                    <TableCell><strong>Attempts</strong></TableCell>
                    <TableCell><strong>Time Limit</strong></TableCell>
                    <TableCell align="right"><strong>Action</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredQuizzes.map((quiz) => {
                    const course = courses.find((c) => c.id === quiz.course);
                    return (
                      <TableRow key={quiz.id}>
                        <TableCell>{quiz.name}</TableCell>
                        <TableCell>{course?.fullname || course?.shortname || `ID: ${quiz.course}`}</TableCell>
                        <TableCell>{quiz.grade}</TableCell>
                        <TableCell>{quiz.attempts}</TableCell>
                        <TableCell>{quiz.timelimit > 0 ? `${quiz.timelimit} min` : "No limit"}</TableCell>
                        <TableCell align="right">
                          <Button
                            variant="contained"
                            size="small"
                            startIcon={<Edit />}
                            onClick={() => navigate(`/quiz/${quiz.id}`)}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No quizzes found</Typography>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
