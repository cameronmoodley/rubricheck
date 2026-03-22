import { useEffect, useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
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
import { Visibility as ViewIcon, Search as SearchIcon, ContentCopy as CopyIcon, Edit as EditIcon } from "@mui/icons-material";
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
  const [searchParams] = useSearchParams();
  const [grades, setGrades] = useState<ExamProjectGrade[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gradingStatus, setGradingStatus] = useState<{
    submissionId: string;
    totalPapers: number;
    gradedCount: number;
    isComplete: boolean;
  } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [detailGrade, setDetailGrade] = useState<ExamProjectGrade | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editedFeedback, setEditedFeedback] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  // Read URL params on mount (from upload redirect)
  useEffect(() => {
    const subjectId = searchParams.get("subjectId");
    const submissionId = searchParams.get("submissionId");
    const paperCount = searchParams.get("paperCount");
    if (subjectId) setSelectedSubjectId(subjectId);
    if (submissionId && paperCount) {
      setGradingStatus({
        submissionId,
        totalPapers: parseInt(paperCount, 10) || 0,
        gradedCount: 0,
        isComplete: false,
      });
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/subjects"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []))
      .catch(() => {});
  }, [token]);

  const fetchGrades = () => {
    if (!token) return Promise.resolve();
    const url = selectedSubjectId ? `/api/exam-projects/grades?subjectId=${selectedSubjectId}` : "/api/exam-projects/grades";
    return fetch(apiUrl(url), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGrades(d.grades || []));
  };

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchGrades()
      .catch((e) => setError(e?.message || "Unknown error"))
      .finally(() => setLoading(false));
  }, [selectedSubjectId, token]);

  // Poll submission status when grading in progress
  useEffect(() => {
    const subId = gradingStatus?.submissionId;
    if (!subId || !token || gradingStatus?.isComplete) return;

    const poll = async () => {
      try {
        const res = await fetch(apiUrl(`/api/submissions/${subId}/status`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = (await res.json()) as { gradedCount?: number; totalPapers?: number; isComplete?: boolean };
        if (res.ok) {
          setGradingStatus((prev) =>
            prev
              ? {
                  ...prev,
                  gradedCount: data.gradedCount ?? prev.gradedCount,
                  totalPapers: data.totalPapers ?? prev.totalPapers,
                  isComplete: data.isComplete ?? false,
                }
              : null
          );
          if (data.isComplete) {
            fetchGrades().finally(() => setGradingStatus(null));
          }
        }
      } catch {
        /* ignore */
      }
    };

    poll();
    const id = setInterval(poll, 4000);
    pollIntervalRef.current = id;
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [gradingStatus?.submissionId, token, gradingStatus?.isComplete]);

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

  const buildPlainTextFeedback = (grade: ExamProjectGrade, feedbackOverrides?: Record<string, string>) => {
    const lines: string[] = [`${grade.studentName} – ${grade.paperFilename}`, ""];
    for (const [criteria, data] of Object.entries(grade.comprehensiveFeedback || {})) {
      const feedback = feedbackOverrides?.[criteria] ?? (data as { feedback: string }).feedback;
      lines.push(formatCriteria(criteria));
      lines.push(feedback);
      lines.push("");
    }
    return lines.join("\n").trim();
  };

  const handleCopyPlainText = async () => {
    if (!detailGrade) return;
    const text = buildPlainTextFeedback(detailGrade, isEditing ? editedFeedback : undefined);
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      // fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleStartEdit = () => {
    if (!detailGrade) return;
    const initial: Record<string, string> = {};
    for (const [criteria, data] of Object.entries(detailGrade.comprehensiveFeedback || {})) {
      initial[criteria] = (data as { feedback: string }).feedback;
    }
    setEditedFeedback(initial);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedFeedback({});
  };

  const handleSaveFeedback = async () => {
    if (!detailGrade || !token) return;
    setSaving(true);
    try {
      const comprehensiveFeedback: Record<string, { feedback: string; mark: number }> = {};
      for (const [criteria, data] of Object.entries(detailGrade.comprehensiveFeedback || {})) {
        comprehensiveFeedback[criteria] = {
          feedback: editedFeedback[criteria] ?? (data as { feedback: string }).feedback,
          mark: (data as { mark: number }).mark,
        };
      }
      const res = await fetch(apiUrl(`/api/grades/${detailGrade.id}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comprehensiveFeedback }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save");
      }
      setDetailGrade((prev) =>
        prev
          ? {
              ...prev,
              comprehensiveFeedback: Object.fromEntries(
                Object.entries(comprehensiveFeedback).map(([k, v]) => [k, { feedback: v.feedback, mark: v.mark }])
              ),
            }
          : null
      );
      setIsEditing(false);
      setEditedFeedback({});
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
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

      {gradingStatus && !gradingStatus.isComplete && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button
              size="small"
              onClick={async () => {
                if (!gradingStatus?.submissionId || !token) return;
                setRetrying(true);
                try {
                  const res = await fetch(apiUrl(`/api/submissions/${gradingStatus.submissionId}/retry`), {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                  });
                  const data = (await res.json().catch(() => ({}))) as { success?: boolean };
                  if (res.ok && data.success) {
                    setGradingStatus((prev) => prev ? { ...prev } : null);
                  }
                } finally {
                  setRetrying(false);
                }
              }}
              disabled={retrying}
            >
              {retrying ? "Retrying..." : "Retry if stuck"}
            </Button>
          }
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <CircularProgress size={20} />
            <Typography>
              Grading {gradingStatus.gradedCount} of {gradingStatus.totalPapers} exam project
              {gradingStatus.totalPapers !== 1 ? "s" : ""}…
            </Typography>
          </Box>
        </Alert>
      )}

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

      <Dialog
        open={!!detailGrade}
        onClose={() => {
          setDetailGrade(null);
          setIsEditing(false);
          setEditedFeedback({});
          setSaveError(null);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {detailGrade?.studentName} – {detailGrade?.paperFilename}
        </DialogTitle>
        <DialogContent dividers>
          {detailGrade && (
            <Box>
              {saveSuccess && <Alert severity="success" sx={{ mb: 2 }}>Feedback saved successfully.</Alert>}
              {saveError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSaveError(null)}>{saveError}</Alert>}
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
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={600}>Detailed Feedback</Typography>
                <Button size="small" startIcon={<CopyIcon />} onClick={handleCopyPlainText}>
                  {copySuccess ? "Copied!" : "Copy as plain text"}
                </Button>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {Object.entries(detailGrade.comprehensiveFeedback || {}).map(([criteria, data]) => (
                  <Box key={criteria} sx={{ p: 2, bgcolor: "grey.50", borderRadius: 1 }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                      <Typography fontWeight={600}>{formatCriteria(criteria)}</Typography>
                      {!isEditing && (
                        <Chip size="small" label={`${data.mark}/100`} color={getScoreColor(data.mark) as "success" | "warning" | "error"} />
                      )}
                    </Box>
                    {isEditing ? (
                      <TextField
                        fullWidth
                        multiline
                        minRows={3}
                        value={editedFeedback[criteria] ?? data.feedback}
                        onChange={(e) => setEditedFeedback((prev) => ({ ...prev, [criteria]: e.target.value }))}
                        variant="outlined"
                        size="small"
                      />
                    ) : (
                      <Typography variant="body2">{data.feedback}</Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!isEditing ? (
            <>
              <Button startIcon={<EditIcon />} onClick={handleStartEdit}>
                Edit Feedback
              </Button>
              <Button variant="contained" onClick={() => setDetailGrade(null)}>Close</Button>
            </>
          ) : (
            <>
              <Button variant="contained" onClick={handleSaveFeedback} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button onClick={handleCancelEdit} disabled={saving}>Cancel</Button>
              <Button variant="contained" onClick={() => setDetailGrade(null)} disabled={saving}>Close</Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
