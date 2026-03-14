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
  LinearProgress,
  Paper,
  Stack,
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { CloudUpload, Description, Quiz, Folder } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

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
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [templates, setTemplates] = useState<{ id: string; name: string; description?: string }[]>([]);
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(apiUrl("/api/classes"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []))
      .catch(() => setError("Failed to load classes"))
      .finally(() => setLoadingClasses(false));
  }, [token]);

  useEffect(() => {
    if (!token || !selectedSubjectId) {
      setTemplates([]);
      return;
    }
    fetch(apiUrl(`/api/rubric-templates?subjectId=${selectedSubjectId}`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates || []))
      .catch(() => setTemplates([]));
  }, [token, selectedSubjectId]);

  useEffect(() => {
    if (!selectedClassId || !token) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }
    setLoadingSubjects(true);
    fetch(apiUrl(`/api/classes/${selectedClassId}/subjects`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []))
      .catch(() => setError("Failed to load subjects"))
      .finally(() => setLoadingSubjects(false));
  }, [selectedClassId, token]);

  const canSubmit = useMemo(() => {
    return !!selectedClassId && !!selectedSubjectId && (!!rubricFile || !!selectedTemplateId) && !!questionFile && paperFiles.length > 0;
  }, [selectedClassId, selectedSubjectId, rubricFile, selectedTemplateId, questionFile, paperFiles]);

  const missingFields = useMemo(() => {
    const m: string[] = [];
    if (!selectedClassId) m.push("class");
    if (!selectedSubjectId) m.push("subject");
    if (!rubricFile && !selectedTemplateId) m.push("rubric or template");
    if (!questionFile) m.push("question file (PDF)");
    if (paperFiles.length === 0) m.push("student project(s)");
    return m;
  }, [selectedClassId, selectedSubjectId, rubricFile, selectedTemplateId, questionFile, paperFiles]);

  const handleRubricChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRubricFile(e.target.files?.[0] || null);
    if (e.target.files?.[0]) setSelectedTemplateId("");
  };
  const handleQuestionChange = (e: React.ChangeEvent<HTMLInputElement>) => setQuestionFile(e.target.files?.[0] || null);
  const handlePapersChange = (e: React.ChangeEvent<HTMLInputElement>) => setPaperFiles(e.target.files ? Array.from(e.target.files) : []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setUploadProgress(0);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (rubricFile) form.append("rubricFile", rubricFile);
      if (selectedTemplateId && !rubricFile) form.append("templateId", selectedTemplateId);
      if (questionFile) form.append("questionFile", questionFile);
      paperFiles.forEach((f) => form.append("paperFiles", f));
      form.append("classId", selectedClassId);
      form.append("subjectId", selectedSubjectId);

      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiUrl("/api/exam-projects"));
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
        });
        xhr.onload = () =>
          resolve(
            new Response(xhr.responseText, {
              status: xhr.status,
              headers: new Headers({ "Content-Type": xhr.getResponseHeader("Content-Type") || "application/json" }),
            })
          );
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(form);
      });

      const data = (await res.json().catch(() => ({}))) as { submissionId?: string; totalPapers?: number; error?: string };
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      const count = data.totalPapers ?? paperFiles.length;
      setResult(`Success! ${count} exam project(s) submitted. Submission ID: ${data.submissionId}`);
      setUploadProgress(100);
      setRubricFile(null);
      setSelectedTemplateId("");
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
      setUploadProgress(0);
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

      <Card sx={{ mb: 3, boxShadow: 2 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 3 }}>Upload Files</Typography>
          <Box component="form" onSubmit={onSubmit}>
            <Stack spacing={3}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                  <Folder fontSize="small" /> 1. Class & Subject
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <SearchableSelect
                      label="Select Class"
                      value={selectedClassId}
                      onChange={setSelectedClassId}
                      options={classes.map((c) => ({
                        id: c.id,
                        label: `${c.name}${c.code ? ` (${c.code})` : ""}${c.teacher ? ` - ${c.teacher.name}` : ""}`,
                      }))}
                      emptyLabel="Choose a class..."
                      width="100%"
                      disabled={loadingClasses}
                      loading={loadingClasses}
                      required
                    />
                  </Grid>
                  {selectedClassId && (
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <SearchableSelect
                        label="Select Subject"
                        value={selectedSubjectId}
                        onChange={setSelectedSubjectId}
                        options={subjects.map((s) => ({
                          id: s.id,
                          label: `${s.name}${s.code ? ` (${s.code})` : ""}`,
                        }))}
                        emptyLabel="Choose a subject..."
                        width="100%"
                        disabled={loadingSubjects || subjects.length === 0}
                        loading={loadingSubjects}
                        required
                      />
                    </Grid>
                  )}
                </Grid>
              </Box>

              {selectedSubjectId && (
                <>
                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                      <Description fontSize="small" /> 2. Rubric or Template
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                      <Stack spacing={2}>
                        <FormControl fullWidth>
                          <InputLabel shrink>Rubric File (PDF)</InputLabel>
                          <Input id="rubric-upload" type="file" inputProps={{ accept: "application/pdf" }} onChange={handleRubricChange} sx={{ mt: 1 }} />
                        </FormControl>
                        <Typography variant="body2" color="text.secondary">— or —</Typography>
                        <SearchableSelect
                          label="Use a template"
                          value={selectedTemplateId}
                          onChange={(v) => {
                            setSelectedTemplateId(v);
                            if (v) setRubricFile(null);
                          }}
                          options={templates.map((t) => ({ id: t.id, label: t.name }))}
                          emptyLabel="No template"
                          width="100%"
                        />
                        {rubricFile && <FormHelperText sx={{ color: "success.main" }}>✓ {rubricFile.name}</FormHelperText>}
                        {selectedTemplateId && !rubricFile && (
                          <FormHelperText sx={{ color: "success.main" }}>
                            ✓ Using template: {templates.find((t) => t.id === selectedTemplateId)?.name}
                          </FormHelperText>
                        )}
                      </Stack>
                    </Paper>
                  </Box>

                  <Box>
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1, display: "flex", alignItems: "center", gap: 1 }}>
                      <Quiz fontSize="small" /> 3. Question File & Student Projects
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: "grey.50" }}>
                      <Stack spacing={2}>
                        <FormControl fullWidth required>
                          <InputLabel shrink>Question Paper (PDF)</InputLabel>
                          <Input id="question-upload" type="file" inputProps={{ accept: "application/pdf" }} onChange={handleQuestionChange} sx={{ mt: 1 }} />
                          {questionFile && <FormHelperText sx={{ color: "success.main" }}>✓ {questionFile.name}</FormHelperText>}
                          {!questionFile && selectedSubjectId && (
                            <FormHelperText color="error">Required: upload the exam question paper</FormHelperText>
                          )}
                        </FormControl>
                        <FormControl fullWidth required>
                          <InputLabel shrink>Student Exam Projects (PDF, up to 25)</InputLabel>
                          <Input id="papers-upload" type="file" inputProps={{ accept: "application/pdf", multiple: true }} onChange={handlePapersChange} sx={{ mt: 1 }} />
                          {paperFiles.length > 0 && <FormHelperText sx={{ color: "success.main" }}>✓ {paperFiles.length} file(s) selected</FormHelperText>}
                        </FormControl>
                      </Stack>
                    </Paper>
                  </Box>
                </>
              )}

              <Box sx={{ pt: 2 }}>
                {submitting && uploadProgress > 0 && uploadProgress < 100 && (
                  <Box sx={{ width: "100%", mb: 2 }}>
                    <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 8, borderRadius: 1 }} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
                      Uploading... {uploadProgress}%
                    </Typography>
                  </Box>
                )}
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={!canSubmit || submitting}
                  startIcon={<CloudUpload />}
                  fullWidth
                  sx={{ py: 1.5, fontSize: "1rem" }}
                >
                  {submitting ? (uploadProgress > 0 ? "Uploading..." : "Processing...") : "Submit for Grading"}
                </Button>
                {!canSubmit && missingFields.length > 0 && (
                  <FormHelperText sx={{ mt: 1, textAlign: "center" }}>
                    Missing: {missingFields.join(", ")}
                  </FormHelperText>
                )}
              </Box>
            </Stack>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ boxShadow: 2 }}>
        <CardContent sx={{ p: 3, bgcolor: "grey.50" }}>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>How it works</Typography>
          <Grid container spacing={3}>
            {steps.map((s) => (
              <Grid size={{ xs: 12, sm: 6, md: 3 }} key={s.num}>
                <Box sx={{ display: "flex", gap: 2, alignItems: "flex-start" }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: "50%", bgcolor: "primary.main", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flexShrink: 0 }}>{s.num}</Box>
                  <Box>
                    <Typography fontWeight={600} variant="subtitle1">{s.title}</Typography>
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
