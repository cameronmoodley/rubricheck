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

type ClassOption = { id: string; name: string; code?: string | null };

export default function SubjectFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const isEdit = !!id;

  useEffect(() => {
    if (user && user.role !== "ADMIN") {
      navigate("/subjects", { replace: true });
    }
  }, [user, navigate]);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token || (user && user.role !== "ADMIN")) return;
    const load = async () => {
      try {
        const [classesRes, subjectRes, assignRes] = await Promise.all([
          fetch("/api/classes", { headers: { Authorization: `Bearer ${token}` } }),
          id ? fetch(`/api/subjects/${id}`, { headers: { Authorization: `Bearer ${token}` } }) : null,
          id ? fetch(`/api/subjects/${id}/classes`, { headers: { Authorization: `Bearer ${token}` } }) : null,
        ]);
        const classesData = await classesRes.json();
        setClasses(classesData.classes || []);

        if (id && subjectRes) {
          const subjData = await subjectRes.json();
          if (subjData.subject) {
            setName(subjData.subject.name);
            setCode(subjData.subject.code || "");
          }
        }
        if (id && assignRes) {
          const assignData = await assignRes.json();
          setSelectedClassIds(assignData.classIds || []);
        }
      } catch {
        setError("Failed to load data");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token, id, user]);

  const selectedClasses = classes.filter((c) => selectedClassIds.includes(c.id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) {
      setError("Subject name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (isEdit) {
        const res = await fetch(`/api/subjects/${id}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() || null,
            classIds: selectedClassIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Failed to save");
          return;
        }
      } else {
        const res = await fetch("/api/subjects/create", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            code: code.trim() || null,
            classIds: selectedClassIds,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "Failed to create");
          return;
        }
      }
      navigate("/subjects");
    } catch {
      setError(isEdit ? "Failed to save subject" : "Failed to create subject");
    } finally {
      setSaving(false);
    }
  };

  if (user && user.role !== "ADMIN") return null;
  if (loading) {
    return (
      <Box>
        <Typography>Loading subject...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Button startIcon={<BackIcon />} onClick={() => navigate("/subjects")} sx={{ mb: 2 }}>
        Back to Subjects
      </Button>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        {isEdit ? "Edit Subject" : "Create Subject"}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {isEdit
          ? "Update the subject name, code, and class assignments."
          : "Define a new subject with a name and code, then assign it to classes."}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Subject Name"
              fullWidth
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Mathematics, English"
              sx={{ mb: 2 }}
            />
            <TextField
              label="Subject Code"
              fullWidth
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g., MATH101, ENG101"
              sx={{ mb: 3 }}
            />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Assign to classes
            </Typography>
            <FormHelperText sx={{ mb: 2 }}>
              Choose which classes this subject will be available for when uploading papers.
            </FormHelperText>
            <Autocomplete
              multiple
              options={classes}
              getOptionLabel={(opt) => (opt.code ? `${opt.name} (${opt.code})` : opt.name)}
              value={selectedClasses}
              onChange={(_, newValue) => {
                setSelectedClassIds(newValue.map((c) => c.id));
              }}
              isOptionEqualToValue={(opt, val) => opt.id === val.id}
              renderInput={(params) => (
                <TextField {...params} label="Classes" placeholder="Select classes..." />
              )}
              sx={{ mb: 3, maxWidth: 500 }}
            />

            <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
              <Button variant="outlined" onClick={() => navigate("/subjects")} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={saving || !name.trim()}>
                {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Subject"}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
