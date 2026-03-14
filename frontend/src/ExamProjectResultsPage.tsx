import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Grid,
  Collapse,
  Chip,
  CircularProgress,
  Button,
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  const formatCriteria = (s: string) => s.replace(/([A-Z])/g, " $1").trim();

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {grades.map((grade) => (
                <Card key={grade.id} variant="outlined">
                  <CardContent>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2 }}>
                      <Box>
                        <Typography variant="h6" fontWeight={600}>{grade.studentName}</Typography>
                        <Typography variant="body2" color="text.secondary">{grade.paperFilename} • {grade.subjectName}</Typography>
                      </Box>
                      <Box sx={{ textAlign: "right" }}>
                        <Chip label={grade.totalScore} color={getScoreColor(grade.totalScore) as "success" | "warning" | "error"} sx={{ fontSize: "1.25rem", fontWeight: 700 }} />
                        <Typography variant="caption" display="block">{getScoreLabel(grade.totalScore)}</Typography>
                      </Box>
                    </Box>

                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" fontWeight={600} gutterBottom>Criteria Breakdown</Typography>
                      <Grid container spacing={1}>
                        {Object.entries(grade.criteriaScores || {}).map(([criteria, score]) => (
                          <Grid size={{ xs: 6, sm: 4, md: 2 }} key={criteria}>
                            <Box sx={{ p: 1.5, bgcolor: "grey.100", borderRadius: 1, textAlign: "center" }}>
                              <Typography variant="caption" color="text.secondary">{formatCriteria(criteria)}</Typography>
                              <Typography><Chip size="small" label={score} color={getScoreColor(score) as "success" | "warning" | "error"} /></Typography>
                            </Box>
                          </Grid>
                        ))}
                      </Grid>
                    </Box>

                    <Button
                      size="small"
                      startIcon={expanded.has(grade.id) ? <ExpandLess /> : <ExpandMore />}
                      onClick={() => toggleExpanded(grade.id)}
                      sx={{ mt: 2 }}
                    >
                      {expanded.has(grade.id) ? "Hide detailed feedback" : "Show detailed feedback"}
                    </Button>

                    <Collapse in={expanded.has(grade.id)}>
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} gutterBottom>Detailed Feedback</Typography>
                        {Object.entries(grade.comprehensiveFeedback || {}).map(([criteria, data]) => (
                          <Card key={criteria} variant="outlined" sx={{ mb: 1, bgcolor: "grey.50" }}>
                            <CardContent>
                              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                                <Typography fontWeight={600}>{formatCriteria(criteria)}</Typography>
                                <Chip size="small" label={`${data.mark}/100`} color={getScoreColor(data.mark) as "success" | "warning" | "error"} />
                              </Box>
                              <Typography variant="body2">{data.feedback}</Typography>
                            </CardContent>
                          </Card>
                        ))}
                      </Box>
                    </Collapse>
                  </CardContent>
                </Card>
              ))}
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
