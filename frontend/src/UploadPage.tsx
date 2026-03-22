import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
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
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { CloudUpload } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

type Class = { id: string; name: string; code?: string; teacher?: { name: string } };
type Subject = { id: string; name: string; code?: string };

export default function UploadPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [rubricFile, setRubricFile] = useState<File | null>(null);
  const [paperFiles, setPaperFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<string | null>(null);
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
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
    if (!selectedClassId || !token) {
      setSubjects([]);
      setSelectedSubjectId("");
      return;
    }
    setLoadingSubjects(true);
    fetch(apiUrl(`/api/classes/${selectedClassId}/subjects`), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => setSubjects(d.subjects || []))
      .catch(() => setError("Failed to load subjects"))
      .finally(() => setLoadingSubjects(false));
  }, [selectedClassId, token]);

  const canSubmit = useMemo(() => {
    return !!selectedClassId && !!selectedSubjectId && !!rubricFile && paperFiles.length > 0;
  }, [selectedClassId, selectedSubjectId, rubricFile, paperFiles]);

  const handleRubricChange = (e: React.ChangeEvent<HTMLInputElement>) => setRubricFile(e.target.files?.[0] || null);
  const handlePapersChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPaperFiles(e.target.files ? Array.from(e.target.files) : []);
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setUploadProgress(0);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      if (rubricFile) form.append("rubricFile", rubricFile);
      paperFiles.forEach((f) => form.append("paperFiles", f));
      form.append("classId", selectedClassId);
      form.append("subjectId", selectedSubjectId);

      const res = await new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", apiUrl("/api/submissions"));
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);

        xhr.upload.addEventListener("progress", (ev) => {
          if (ev.lengthComputable) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
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

      const data = (await res.json().catch(() => ({}))) as { submissionId?: string; papers?: unknown[] };
      if (!res.ok) {
        throw new Error(data.error || `Upload failed (${res.status})`);
      }
      const count = data.papers?.length ?? paperFiles.length;
      setLastSubmissionId(data.submissionId ?? null);
      setRubricFile(null);
      setPaperFiles([]);
      setUploadProgress(100);

      const params = new URLSearchParams();
      params.set("classId", selectedClassId);
      params.set("subjectId", selectedSubjectId);
      if (data.submissionId) params.set("submissionId", data.submissionId);
      params.set("paperCount", String(count));
      navigate(`/results?${params.toString()}`);

      setSelectedSubjectId("");
      (document.getElementById("rubric-upload") as HTMLInputElement)?.form?.reset();
      (document.getElementById("papers-upload") as HTMLInputElement)?.form?.reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  }

  const handleRetry = async () => {
    if (!lastSubmissionId || !token) return;
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(apiUrl(`/api/submissions/${lastSubmissionId}/retry`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; error?: string };
      if (res.ok && data.success) {
        setResult((prev) => (prev ? `${prev} Retry triggered.` : "Retry triggered."));
      } else {
        setError(data.error || data.message || "Retry failed");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  const steps = [
    { num: 1, title: "Select Class", desc: "Choose the class you're grading for" },
    { num: 2, title: "Select Subject", desc: "Pick the subject from that class" },
    { num: 3, title: "Upload Files", desc: "Upload rubric and student papers (PDFs)" },
    { num: 4, title: "AI Grading", desc: "Papers are graded sequentially by AI" },
  ];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>AI Grading</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Select a class and subject, then upload your rubric and student papers for AI-powered grading
        {user?.role === "TEACHER" && " (showing only your assigned classes)"}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {result && (
        <Alert
          severity="success"
          sx={{ mb: 2 }}
          action={
            lastSubmissionId && (
              <Button color="inherit" size="small" onClick={handleRetry} disabled={retrying}>
                {retrying ? "Retrying..." : "Retry if stuck"}
              </Button>
            )
          }
        >
          {result}
        </Alert>
      )}

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
                {!loadingClasses && classes.length === 0 && (
                  <FormHelperText>No classes available. Contact an administrator.</FormHelperText>
                )}
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
                      <Input
                        id="rubric-upload"
                        type="file"
                        inputProps={{ accept: "application/pdf" }}
                        onChange={handleRubricChange}
                      />
                      {rubricFile && (
                        <FormHelperText sx={{ color: "success.main" }}>✓ {rubricFile.name}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth required>
                      <InputLabel shrink>Student Papers (PDF, up to 25)</InputLabel>
                      <Input
                        id="papers-upload"
                        type="file"
                        inputProps={{ accept: "application/pdf", multiple: true }}
                        onChange={handlePapersChange}
                      />
                      {paperFiles.length > 0 && (
                        <FormHelperText sx={{ color: "success.main" }}>
                          ✓ {paperFiles.length} file(s) selected
                        </FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                </>
              )}
              <Grid size={{ xs: 12 }}>
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
                >
                  {submitting ? (uploadProgress > 0 ? "Uploading..." : "Processing...") : "Submit for Grading"}
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
                  <Box
                    sx={{
                      width: 40,
                      height: 40,
                      borderRadius: 2,
                      bgcolor: "primary.main",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                    }}
                  >
                    {s.num}
                  </Box>
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
