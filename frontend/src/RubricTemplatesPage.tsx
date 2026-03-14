import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
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
  DialogActions,
  Checkbox,
  IconButton,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";

type Subject = { id: string; name: string; code?: string | null };
type RubricTemplate = { id: string; name: string; description?: string; criteria?: Record<string, { maxScore: number; description: string }> };

type CriterionRow = { key: string; maxScore: number; description: string };

export default function RubricTemplatesPage() {
  const { token } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [templates, setTemplates] = useState<RubricTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createCriteria, setCreateCriteria] = useState<CriterionRow[]>([
    { key: "criterion1", maxScore: 25, description: "" },
  ]);
  const [creating, setCreating] = useState(false);

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSubject, setAssignSubject] = useState<Subject | null>(null);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [loadingAssign, setLoadingAssign] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const [subjRes, tmplRes] = await Promise.all([
        fetch("/api/subjects", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/rubric-templates/all", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const subjData = await subjRes.json();
      const tmplData = await tmplRes.json();
      setSubjects(subjData.subjects || []);
      setTemplates(tmplData.templates || []);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const openAssign = async (subject: Subject) => {
    if (!token) return;
    setAssignSubject(subject);
    setAssignOpen(true);
    setLoadingAssign(true);
    try {
      const res = await fetch(`/api/rubric-templates/subjects/${subject.id}/templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAssignedIds(data.templateIds || []);
    } catch {
      setAssignedIds([]);
    } finally {
      setLoadingAssign(false);
    }
  };

  const saveAssign = async () => {
    if (!token || !assignSubject) return;
    setSavingAssign(true);
    setError("");
    try {
      const res = await fetch(`/api/rubric-templates/subjects/${assignSubject.id}/templates`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ templateIds: assignedIds }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Templates updated for ${assignSubject.name}`);
        setAssignOpen(false);
      } else setError(data.error || "Failed to save");
    } catch {
      setError("Failed to save");
    } finally {
      setSavingAssign(false);
    }
  };

  const toggleAssign = (id: string) => {
    setAssignedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addCriterion = () => {
    setCreateCriteria((prev) => [
      ...prev,
      { key: `criterion${prev.length + 1}`, maxScore: 20, description: "" },
    ]);
  };

  const removeCriterion = (i: number) => {
    setCreateCriteria((prev) => prev.filter((_, idx) => idx !== i));
  };

  const updateCriterion = (i: number, field: keyof CriterionRow, value: string | number) => {
    setCreateCriteria((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !createName.trim()) {
      setError("Template name is required");
      return;
    }
    const criteriaObj: Record<string, { maxScore: number; description: string }> = {};
    for (const c of createCriteria) {
      const k = (c.key || "criterion").trim().toLowerCase().replace(/\s+/g, "_") || "criterion";
      criteriaObj[k] = { maxScore: Number(c.maxScore) || 0, description: (c.description || "").trim() };
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/rubric-templates", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDesc.trim() || undefined,
          criteria: Object.keys(criteriaObj).length ? criteriaObj : { content: { maxScore: 100, description: "Overall quality" } },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Template "${createName}" created!`);
        setCreateOpen(false);
        setCreateName("");
        setCreateDesc("");
        setCreateCriteria([{ key: "criterion1", maxScore: 25, description: "" }]);
        fetchData();
      } else setError(data.error || "Failed to create");
    } catch {
      setError("Failed to create template");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Rubric Templates
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Create templates and assign them to subjects. Assigned templates appear when uploading papers for that subject.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Create Template</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              New Template
            </Button>
          </Box>
          {templates.length === 0 && !loading && (
            <Typography color="text.secondary">
              No templates yet. Create one to get started, or run the database seed for predefined templates (Essay, Lab Report, etc.).
            </Typography>
          )}
          {templates.length > 0 && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Name</strong></TableCell>
                    <TableCell><strong>Description</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>Assign Templates to Subjects</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a subject to choose which templates appear when uploading papers for that subject.
          </Typography>
          {loading ? (
            <Typography>Loading...</Typography>
          ) : subjects.length === 0 ? (
            <Typography color="text.secondary">No subjects in your classes. Contact an administrator to assign subjects to your classes.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Subject</strong></TableCell>
                    <TableCell><strong>Code</strong></TableCell>
                    <TableCell><strong>Actions</strong></TableCell>
                  </TableHead>
                <TableBody>
                  {subjects.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.code || "-"}</TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => openAssign(s)}>
                          Assign Templates
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => !creating && setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create Rubric Template</DialogTitle>
        <form onSubmit={handleCreate}>
          <DialogContent>
            <TextField
              label="Template Name"
              fullWidth
              required
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="e.g., Essay, Lab Report"
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={2}
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              placeholder="Brief description of when to use this template"
              sx={{ mb: 2 }}
            />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Criteria (each with max score and description)</Typography>
            {createCriteria.map((c, i) => (
              <Box key={i} sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
                <TextField
                  size="small"
                  label="Key"
                  value={c.key}
                  onChange={(e) => updateCriterion(i, "key", e.target.value)}
                  placeholder="e.g., thesis"
                  sx={{ width: 120 }}
                />
                <TextField
                  size="small"
                  type="number"
                  label="Max"
                  value={c.maxScore}
                  onChange={(e) => updateCriterion(i, "maxScore", Number(e.target.value) || 0)}
                  inputProps={{ min: 0, max: 100 }}
                  sx={{ width: 70 }}
                />
                <TextField
                  size="small"
                  label="Description"
                  fullWidth
                  value={c.description}
                  onChange={(e) => updateCriterion(i, "description", e.target.value)}
                  placeholder="What to evaluate"
                />
                <IconButton size="small" onClick={() => removeCriterion(i)} color="error" disabled={createCriteria.length <= 1}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Box>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addCriterion} sx={{ mt: 1 }}>
              Add criterion
            </Button>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateOpen(false)} disabled={creating}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={creating || !createName.trim()}>
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={assignOpen} onClose={() => !savingAssign && setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Templates to {assignSubject?.name}</DialogTitle>
        <DialogContent>
          {loadingAssign ? (
            <Typography>Loading...</Typography>
          ) : templates.length === 0 ? (
            <Typography color="text.secondary">No templates available. Create one first.</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox"><strong>Assign</strong></TableCell>
                    <TableCell><strong>Template</strong></TableCell>
                    <TableCell><strong>Description</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={assignedIds.includes(t.id)} onChange={() => toggleAssign(t.id)} />
                      </TableCell>
                      <TableCell>{t.name}</TableCell>
                      <TableCell>{t.description || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)} disabled={savingAssign}>Cancel</Button>
          <Button onClick={saveAssign} variant="contained" disabled={savingAssign || loadingAssign}>
            {savingAssign ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
