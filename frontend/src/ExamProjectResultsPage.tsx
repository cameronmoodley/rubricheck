import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Chip,
  CircularProgress,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  TextField,
  InputAdornment,
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { Visibility as ViewIcon, Search as SearchIcon } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

type ExamProjectGrade = {
  id: string;
  studentName: string;
  paperFilename: string;
  uploadedAt: string;
  subjectName: string;
  subjectCode?: string;
  totalScore: number;
  criteriaScores: Record<string, number>;
  comprehensiveFeedback: Record<string, { feedback: string; mark: number }>;
};

type Subject = { id: string; name: string; code?: string };

export default function ExamProjectResultsPage() {
  const { token } = useAuth();
  const [grades, setGrades] = useState<ExamProjectGrade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailGrade, setDetailGrade] = useState<ExamProjectGrade | null>(null);
  const [studentSearch, setStudentSearch] = useState("");

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/subjects"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []))
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const url = selectedSubjectId ? `/api/exam-projects/grades?subjectId=${selectedSubjectId}` : "/api/exam-projects/grades";
    fetch(apiUrl(url), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGrades(d.grades || []))
      .catch((e) => setError(e.message || "Unknown error"))
      .finally(() => setLoading(false));
  }, [selectedSubjectId, token]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "success";
    if (score >= 70) return "warning";
    if (score >= 60) return "warning";
    return "error";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 60) return "Satisfactory";
    return "Needs Improvement";
  };

  const formatCriteria = (s: string) => {
    const withSpaces = s.replace(/([A-Z])/g, " $1").trim();
    return withSpaces
      .split(" ")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  };

  const filteredGrades = grades.filter(
    (g) => !studentSearch || g.studentName.toLowerCase().includes(studentSearch.toLowerCase())
  );

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Exam Project Results</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        View detailed grading results for exam projects with section-by-section feedback
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <SearchableSelect
            label="Filter by Subject"
            value={selectedSubjectId}
            onChange={setSelectedSubjectId}
            options={subjects.map((s) => ({ id: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ""}` }))}
            emptyLabel="All Subjects"
            width={320}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : error ? (
            <Alert severity="error">{error}</Alert>
          ) : grades.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
              No exam project results found. Upload and grade some exam projects to see results here.
            </Typography>
          ) : (
            <>
              <TextField
                size="small"
                placeholder="Search students..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, maxWidth: 320 }}
              />
              {filteredGrades.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                  No students match &quot;{studentSearch}&quot;
                </Typography>
              ) : (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Student</strong></TableCell>
                    <TableCell><strong>Project</strong></TableCell>
                    <TableCell><strong>Subject</strong></TableCell>
                    <TableCell><strong>Score</strong></TableCell>
                    <TableCell><strong>Rating</strong></TableCell>
                    <TableCell align="right" width={100}><strong>Actions</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredGrades.map((grade) => (
                    <TableRow key={grade.id} hover>
                      <TableCell>{grade.studentName}</TableCell>
                      <TableCell>{grade.paperFilename}</TableCell>
                      <TableCell>{grade.subjectName}{grade.subjectCode ? ` (${grade.subjectCode})` : ""}</TableCell>
                      <TableCell>
                        <Chip size="small" label={`${grade.totalScore}%`} color={getScoreColor(grade.totalScore) as "success" | "warning" | "error"} />
                      </TableCell>
                      <TableCell>{getScoreLabel(grade.totalScore)}</TableCell>
                      <TableCell align="right">
                        <IconButton size="small" onClick={() => setDetailGrade(grade)} title="View details">
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
              )}
              {studentSearch && filteredGrades.length > 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                  {filteredGrades.length} of {grades.length} result{filteredGrades.length !== 1 ? "s" : ""}
                </Typography>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!detailGrade} onClose={() => setDetailGrade(null)} maxWidth="md" fullWidth>
        <DialogTitle>
          {detailGrade?.studentName} – {detailGrade?.paperFilename}
        </DialogTitle>
        <DialogContent dividers>
          {detailGrade && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
                <Chip label={`${detailGrade.totalScore}%`} color={getScoreColor(detailGrade.totalScore) as "success" | "warning" | "error"} sx={{ fontSize: "1.1rem" }} />
                <Typography variant="body2" color="text.secondary">{getScoreLabel(detailGrade.totalScore)}</Typography>
              </Box>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Criteria Breakdown</Typography>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
                {Object.entries(detailGrade.criteriaScores || {}).map(([criteria, score]) => (
                  <Chip key={criteria} size="small" label={`${formatCriteria(criteria)}: ${score}`} color={getScoreColor(score) as "success" | "warning" | "error"} />
                ))}
              </Box>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>Detailed Feedback</Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {Object.entries(detailGrade.comprehensiveFeedback || {}).map(([criteria, data]) => (
                  <Box key={criteria} sx={{ p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                      <Typography fontWeight={600}>{formatCriteria(criteria)}</Typography>
                      <Chip size="small" label={`${data.mark}/100`} color={getScoreColor(data.mark) as "success" | "warning" | "error"} />
                    </Box>
                    <Typography variant="body2">{data.feedback}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetailGrade(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
