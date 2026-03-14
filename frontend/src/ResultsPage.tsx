import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Alert,
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
  TextField,
  InputAdornment,
  Pagination,
  Chip,
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { Search, Download } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

type Grade = {
  id: string;
  studentName: string;
  score: number;
  goodComments?: string;
  badComments?: string;
  gradedAt: string;
  paperFilename: string;
  uploadedAt: string;
  subjectName: string;
  subjectCode?: string;
};

type Class = { id: string; name: string; code?: string };
type Subject = { id: string; name: string; code?: string };

export default function ResultsPage() {
  const { token, user } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState<Grade | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedGood, setEditedGood] = useState("");
  const [editedBad, setEditedBad] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/classes"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []))
      .finally(() => setLoadingClasses(false));
  }, [token]);

  useEffect(() => {
    if (!selectedClassId || !token) {
      setSubjects([]);
      return;
    }
    fetch(apiUrl(`/api/classes/${selectedClassId}/subjects`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []));
  }, [selectedClassId, token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (selectedClassId) params.set("classId", selectedClassId);
    if (selectedSubjectId) params.set("subjectId", selectedSubjectId);
    const url = params.toString() ? `/api/grades?${params.toString()}` : "/api/grades";
    fetch(apiUrl(url), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGrades(d.grades || []))
      .catch(() => setError("Failed to fetch grades"))
      .finally(() => setLoading(false));
  }, [token, selectedClassId, selectedSubjectId]);

  const filtered = grades.filter(
    (g) =>
      !search ||
      g.studentName.toLowerCase().includes(search.toLowerCase()) ||
      g.paperFilename.toLowerCase().includes(search.toLowerCase()) ||
      g.subjectName.toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  const getScoreBadge = (score: number) => {
    if (score >= 90) return { label: "A", color: "success" as const };
    if (score >= 80) return { label: "B", color: "info" as const };
    if (score >= 70) return { label: "C", color: "warning" as const };
    if (score >= 60) return { label: "D", color: "warning" as const };
    return { label: "F", color: "error" as const };
  };

  const openDetail = (grade: Grade) => {
    setSelectedGrade(grade);
    setEditedGood(grade.goodComments || "");
    setEditedBad(grade.badComments || "");
    setIsEditing(false);
    setSaveSuccess(false);
    setDetailOpen(true);
  };

  const handleSaveFeedback = async () => {
    if (!selectedGrade || !token) return;
    try {
      setSaving(true);
      setSaveSuccess(false);
      const res = await fetch(apiUrl(`/api/grades/${selectedGrade.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ goodComments: editedGood, badComments: editedBad }),
      });
      if (res.ok) {
        setSaveSuccess(true);
        setIsEditing(false);
        setGrades((prev) =>
          prev.map((g) =>
            g.id === selectedGrade.id ? { ...g, goodComments: editedGood, badComments: editedBad } : g
          )
        );
        setSelectedGrade({ ...selectedGrade, goodComments: editedGood, badComments: editedBad });
      } else {
        const data = await res.json();
        alert(data.message || "Failed to save");
      }
    } catch {
      alert("Error saving feedback");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert(`${label} copied!`);
    } catch {
      alert("Failed to copy");
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    if (!token) return;
    const params = new URLSearchParams();
    if (selectedClassId) params.set("classId", selectedClassId);
    if (selectedSubjectId) params.set("subjectId", selectedSubjectId);
    params.set("format", format);
    const res = await fetch(apiUrl(`/api/grades/export?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      setError("Export failed");
      return;
    }
    const blob = await res.blob();
    const ext = format === "xlsx" ? "xlsx" : "csv";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grades-${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Grading Results</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        View all graded papers and detailed feedback
        {user?.role === "TEACHER" && " (showing only your assigned classes)"}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            <SearchableSelect
              label="Filter by Class"
              value={selectedClassId}
              onChange={(v) => { setSelectedClassId(v); setSelectedSubjectId(""); }}
              options={classes.map((c) => ({ id: c.id, label: `${c.name}${c.code ? ` (${c.code})` : ""}` }))}
              emptyLabel="All Classes"
              width={320}
              disabled={loadingClasses}
            />
            <SearchableSelect
              label="Filter by Subject"
              value={selectedSubjectId}
              onChange={setSelectedSubjectId}
              options={subjects.map((s) => ({ id: s.id, label: `${s.name}${s.code ? ` (${s.code})` : ""}` }))}
              emptyLabel="All Subjects"
              width={320}
              disabled={!selectedClassId || subjects.length === 0}
            />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Graded Papers ({filtered.length})</Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Button size="small" startIcon={<Download />} onClick={() => handleExport("csv")} disabled={loading}>
                Export CSV
              </Button>
              <Button size="small" startIcon={<Download />} onClick={() => handleExport("xlsx")} disabled={loading}>
                Export Excel
              </Button>
              <TextField
              size="small"
              placeholder="Search by student, filename, or subject"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              sx={{ maxWidth: 350 }}
            />
            </Box>
          </Box>

          {loading ? (
            <Typography>Loading grades...</Typography>
          ) : filtered.length === 0 ? (
            <Typography color="text.secondary">No graded papers found. Upload papers to get started!</Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Student Name</strong></TableCell>
                      <TableCell><strong>Subject</strong></TableCell>
                      <TableCell><strong>Score</strong></TableCell>
                      <TableCell><strong>Grade</strong></TableCell>
                      <TableCell><strong>Graded At</strong></TableCell>
                      <TableCell><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map((g) => {
                      const badge = getScoreBadge(g.score);
                      return (
                        <TableRow key={g.id}>
                          <TableCell>{g.studentName}</TableCell>
                          <TableCell>{g.subjectName}{g.subjectCode ? ` (${g.subjectCode})` : ""}</TableCell>
                          <TableCell>{g.score}%</TableCell>
                          <TableCell><Chip label={badge.label} color={badge.color} size="small" /></TableCell>
                          <TableCell>{new Date(g.gradedAt).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button size="small" onClick={() => openDetail(g)}>View Details</Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <Pagination count={Math.ceil(filtered.length / perPage)} page={page} onChange={(_, p) => setPage(p)} color="primary" />
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        {selectedGrade && (
          <>
            <DialogTitle>{selectedGrade.studentName} - {selectedGrade.subjectName}</DialogTitle>
            <DialogContent>
              {saveSuccess && <Alert severity="success" sx={{ mb: 2 }}>Feedback saved successfully!</Alert>}
              <Typography variant="h6" gutterBottom>Score: {selectedGrade.score}% ({getScoreBadge(selectedGrade.score).label})</Typography>
              <Typography variant="body2" color="text.secondary"><strong>Paper:</strong> {selectedGrade.paperFilename}</Typography>
              <Typography variant="body2" color="text.secondary"><strong>Uploaded:</strong> {new Date(selectedGrade.uploadedAt).toLocaleString()}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}><strong>Graded:</strong> {new Date(selectedGrade.gradedAt).toLocaleString()}</Typography>

              {(selectedGrade.goodComments || isEditing) && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography fontWeight={600}>✓ Positive Feedback</Typography>
                    {!isEditing && selectedGrade.goodComments && (
                      <Button size="small" onClick={() => copyToClipboard(selectedGrade.goodComments || "", "Positive Feedback")}>Copy</Button>
                    )}
                  </Box>
                  {isEditing ? (
                    <TextField fullWidth multiline rows={4} value={editedGood} onChange={(e) => setEditedGood(e.target.value)} />
                  ) : (
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}><Typography variant="body2">{selectedGrade.goodComments}</Typography></Paper>
                  )}
                </Box>
              )}

              {(selectedGrade.badComments || isEditing) && (
                <Box sx={{ mb: 2 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                    <Typography fontWeight={600}>✗ Areas for Improvement</Typography>
                    {!isEditing && selectedGrade.badComments && (
                      <Button size="small" onClick={() => copyToClipboard(selectedGrade.badComments || "", "Areas for Improvement")}>Copy</Button>
                    )}
                  </Box>
                  {isEditing ? (
                    <TextField fullWidth multiline rows={4} value={editedBad} onChange={(e) => setEditedBad(e.target.value)} />
                  ) : (
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}><Typography variant="body2">{selectedGrade.badComments}</Typography></Paper>
                  )}
                </Box>
              )}

              <Box sx={{ display: "flex", justifyContent: "space-between", mt: 2 }}>
                <Box>
                  {!isEditing ? (
                    <Button variant="outlined" onClick={() => setIsEditing(true)}>Edit Feedback</Button>
                  ) : (
                    <>
                      <Button variant="contained" onClick={handleSaveFeedback} disabled={saving} sx={{ mr: 1 }}>{saving ? "Saving..." : "Save"}</Button>
                      <Button onClick={() => { setIsEditing(false); setEditedGood(selectedGrade.goodComments || ""); setEditedBad(selectedGrade.badComments || ""); }} disabled={saving}>Cancel</Button>
                    </>
                  )}
                </Box>
                <Button variant="contained" onClick={() => setDetailOpen(false)}>Close</Button>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
}
