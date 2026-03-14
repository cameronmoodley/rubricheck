import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  FormHelperText,
  Autocomplete,
} from "@mui/material";
import { ArrowBack as BackIcon } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";

export default function RubricTemplateFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { token } = useAuth();
  const isEdit = !!id;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [subjects, setSubjects] = useState<{ id: string; name: string; code?: string | null }[]>([]);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const [subjRes, tmplRes, assignRes] = await Promise.all([
          fetch("/api/subjects", { headers: { Authorization: `Bearer ${token}` } }),
          id ? fetch(`/api/rubric-templates/${id}`, { headers: { Authorization: `Bearer ${token}` } }) : null,
          id ? fetch(`/api/rubric-templates/${id}/subjects`, { headers: { Authorization: `Bearer ${token}` } }) : null,
        ]);
        const subjData = await subjRes.json();
        setSubjects(subjData.subjects || []);
        if (id && tmplRes) {
          const tmplData = await tmplRes.json();
          if (tmplData.template) {
            setName(tmplData.template.name);
            setDescription(tmplData.template.description || "");
          }
        }
        if (id && assignRes) {
          const assignData = await assignRes.json();
          setSelectedSubjectIds(assignData.subjectIds || []);
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, id]);

  const selectedSubjects = subjects.filter((s) => selectedSubjectIds.includes(s.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) {
      setError("Template name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        criteria: { content: { maxScore: 100, description: "Overall quality" } },
      };
      const url = isEdit ? `/api/rubric-templates/${id}` : "/api/rubric-templates";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
        return;
      }
      const templateId = data.template?.id || id;
      if (templateId) {
        for (const subject of subjects) {
          const assignRes = await fetch(`/api/rubric-templates/subjects/${subject.id}/templates`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const assignData = await assignRes.json();
          const currentIds = (assignData.templateIds || []) as string[];
          const shouldHave = selectedSubjectIds.includes(subject.id);
          const hasIt = currentIds.includes(templateId);
          if (shouldHave && !hasIt) {
            await fetch(`/api/rubric-templates/subjects/${subject.id}/templates`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ templateIds: [...currentIds, templateId] }),
            });
          } else if (!shouldHave && hasIt) {
            await fetch(`/api/rubric-templates/subjects/${subject.id}/templates`, {
              method: "PUT",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ templateIds: currentIds.filter((x) => x !== templateId) }),
            });
          }
        }
      }
      navigate("/rubric-templates");
    } catch {
      setError("Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box>
        <Typography>Loading template...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Button startIcon={<BackIcon />} onClick={() => navigate("/rubric-templates")} sx={{ mb: 2 }}>
        Back to Templates
      </Button>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {isEdit ? "Edit Template" : "Create Template"}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {isEdit ? "Update the template name, description, and subject assignments." : "Define a new rubric template with a name and description, then assign it to subjects."}
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Template Name"
              fullWidth
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Essay, Lab Report"
              sx={{ mb: 2 }}
            />
            <TextField
              label="Description"
              fullWidth
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of when to use this template"
              sx={{ mb: 3 }}
            />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Assign to subjects
            </Typography>
            <FormHelperText sx={{ mb: 2 }}>
              Choose which subjects this template will appear for when uploading papers.
            </FormHelperText>
            <Autocomplete
              multiple
              options={subjects}
              getOptionLabel={(opt) => (opt.code ? `${opt.name} (${opt.code})` : opt.name)}
              value={selectedSubjects}
              onChange={(_, newValue) => {
                setSelectedSubjectIds(newValue.map((s) => s.id));
              }}
              isOptionEqualToValue={(opt, val) => opt.id === val.id}
              renderInput={(params) => (
                <TextField {...params} label="Subjects" placeholder="Select subjects..." />
              )}
              sx={{ mb: 3, maxWidth: 500 }}
            />

            <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
              <Button variant="outlined" onClick={() => navigate("/rubric-templates")} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={saving || !name.trim()}>
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Template"}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
