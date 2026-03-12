import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Button,
  Alert,
  Grid,
  Input,
  FormHelperText,
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { CloudUpload } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";

type Class = { id: string; name: string; code?: string; teacher?: { name: string } };
type Subject = { id: string; name: string; code?: string };

export default function ExamProjectsPage() {
  const { token, user } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/classes", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []))
      .catch(() => setError("Failed to load classes"))
      .finally(() => setLoadingClasses(false));
  }, [token]);

  useEffect(() => {
    if (!selectedClassId || !token) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }
    setLoadingSubjects(true);
    fetch(`/api/classes/${selectedClassId}/subjects`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []))
      .catch(() => setError("Failed to load subjects"))
      .finally(() => setLoadingSubjects(false));
  }, [selectedClassId, token]);

  const canSubmit = useMemo(() => {
    return !!selectedClassId && !!selectedSubjectId && !!rubricFile && !!questionFile && paperFiles.length > 0;
  }, [selectedClassId, selectedSubjectId, rubricFile, questionFile, paperFiles]);

  const handleRubricChange = (e: React.ChangeEvent<HTMLInputElement>) => setRubricFile(e.target.files?.[0] || null);
  const handleQuestionChange = (e: React.ChangeEvent<HTMLInputElement>) => setQuestionFile(e.target.files?.[0] || null);
  const handlePapersChange = (e: React.ChangeEvent<HTMLInputElement>) => setPaperFiles(e.target.files ? Array.from(e.target.files) : []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (rubricFile) form.append("rubricFile", rubricFile);
      if (questionFile) form.append("questionFile", questionFile);
      paperFiles.forEach((f) => form.append("paperFiles", f));
      form.append("classId", selectedClassId);
      form.append("subjectId", selectedSubjectId);

      const res = await fetch("/api/exam-projects", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Upload failed (${res.status})`);
      }
      const data = await res.json();
      const count = data.totalPapers ?? paperFiles.length;
      setResult(`Success! ${count} exam project(s) submitted. Submission ID: ${data.submissionId}`);
      setRubricFile(null);
      setQuestionFile(null);
      setPaperFiles([]);
      setSelectedSubjectId("");
      (document.getElementById("rubric-upload") as HTMLInputElement)?.form?.reset();
      (document.getElementById("question-upload") as HTMLInputElement)?.form?.reset();
      (document.getElementById("papers-upload") as HTMLInputElement)?.form?.reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  const steps = [
    { num: 1, title: "Select Class & Subject", desc: "Choose the class and subject you're grading for" },
    { num: 2, title: "Upload Rubric", desc: "Upload your grading rubric as a PDF" },
    { num: 3, title: "Upload Question & Projects", desc: "Upload question paper and exam projects (PDFs)" },
    { num: 4, title: "AI Grading", desc: "Projects are graded sequentially by AI" },
  ];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Exam Project Grading</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Select a class and subject, then upload rubric, question, and student exam projects for AI-powered grading
        {user?.role === "TEACHER" && " (showing only your assigned classes)"}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {result && <Alert severity="success" sx={{ mb: 2 }}>{result}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>Upload Files</Typography>
          <Box component="form" onSubmit={onSubmit}>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12 }}>
                <SearchableSelect
                  label="Select Class"
                  value={selectedClassId}
                  onChange={setSelectedClassId}
                  options={classes.map((c) => ({
                    id: c.id,
                    label: `${c.name}${c.code ? ` (${c.code})` : ""}${c.teacher ? ` - ${c.teacher.name}` : ""}`,
                  }))}
                  emptyLabel="Choose a class..."
                  width={320}
                  disabled={loadingClasses}
                  loading={loadingClasses}
                  required
                />
              </Grid>
              {selectedClassId && (
                <Grid size={{ xs: 12 }}>
                  <SearchableSelect
                    label="Select Subject"
                    value={selectedSubjectId}
                    onChange={setSelectedSubjectId}
                    options={subjects.map((s) => ({
                      id: s.id,
                      label: `${s.name}${s.code ? ` (${s.code})` : ""}`,
                    }))}
                    emptyLabel="Choose a subject..."
                    width={320}
                    disabled={loadingSubjects || subjects.length === 0}
                    loading={loadingSubjects}
                    required
                  />
                </Grid>
              )}
              {selectedSubjectId && (
                <>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth required>
                      <InputLabel shrink>Rubric File (PDF)</InputLabel>
                      <Input id="rubric-upload" type="file" inputProps={{ accept: "application/pdf" }} onChange={handleRubricChange} />
                      {rubricFile && <FormHelperText sx={{ color: "success.main" }}>✓ {rubricFile.name}</FormHelperText>}
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth required>
                      <InputLabel shrink>Question File (PDF)</InputLabel>
                      <Input id="question-upload" type="file" inputProps={{ accept: "application/pdf" }} onChange={handleQuestionChange} />
                      {questionFile && <FormHelperText sx={{ color: "success.main" }}>✓ {questionFile.name}</FormHelperText>}
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth required>
                      <InputLabel shrink>Student Exam Projects (PDF, up to 5)</InputLabel>
                      <Input id="papers-upload" type="file" inputProps={{ accept: "application/pdf", multiple: true }} onChange={handlePapersChange} />
                      {paperFiles.length > 0 && <FormHelperText sx={{ color: "success.main" }}>✓ {paperFiles.length} file(s) selected</FormHelperText>}
                    </FormControl>
                  </Grid>
                </>
              )}
              <Grid size={{ xs: 12 }}>
                <Button type="submit" variant="contained" size="large" disabled={!canSubmit || submitting} startIcon={<CloudUpload />} fullWidth>
                  {submitting ? "Processing..." : "Submit for Grading"}
                </Button>
              </Grid>
            </Grid>
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>How it works</Typography>
          <Grid container spacing={3}>
            {steps.map((s) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={s.num}>
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                  <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: "primary.main", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{s.num}</Box>
                  <Box>
                    <Typography fontWeight={600}>{s.title}</Typography>
                    <Typography variant="body2" color="text.secondary">{s.desc}</Typography>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
