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
  InputAdornment,
  Pagination,
} from "@mui/material";
import { Search } from "@mui/icons-material";
import { SearchableSelect } from "./components/SearchableSelect";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

type Teacher = { id: string; name: string; email: string; role: string };
type Class = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  teacher_id: string | null;
  teacher: Teacher | null;
  created_at: string;
};

export default function ClassesPage() {
  const { user, token } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTeachers, setLoadingTeachers] = useState(true);
  const [formData, setFormData] = useState({ name: "", code: "", description: "", teacher_id: "" });
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [classToDelete, setClassToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<Class | null>(null);
  const [editFormData, setEditFormData] = useState({ name: "", code: "", description: "", teacher_id: "" });

  const fetchClasses = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/api/classes"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setClasses((await res.json()).classes || []);
      else setError("Failed to fetch classes");
    } catch {
      setError("Error fetching classes");
    } finally {
      setLoading(false);
    }
  };

  const fetchTeachers = async () => {
    if (!token) return;
    try {
      setLoadingTeachers(true);
      const res = await fetch(apiUrl("/api/teachers"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setTeachers((await res.json()).teachers || []);
    } catch {
      console.error("Error fetching teachers");
    } finally {
      setLoadingTeachers(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchTeachers();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formData.name.trim()) {
      setError("Class name is required");
      return;
    }
    try {
      setSubmitting(true);
      setSuccess("");
      setError("");
      const res = await fetch(apiUrl("/api/classes/create"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Class "${formData.name}" created successfully!`);
        setFormData({ name: "", code: "", description: "", teacher_id: "" });
        fetchClasses();
      } else setError(data.message || "Failed to create class");
    } catch {
      setError("Error creating class");
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (c: Class) => {
    setClassToEdit(c);
    setEditFormData({
      name: c.name,
      code: c.code || "",
      description: c.description || "",
      teacher_id: c.teacher_id || "",
    });
    setEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !classToEdit || !editFormData.name.trim()) {
      setError("Class name is required");
      return;
    }
    try {
      setSubmitting(true);
      setSuccess("");
      setError("");
      const res = await fetch(apiUrl(`/api/classes/${classToEdit.id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Class "${editFormData.name}" updated successfully!`);
        setEditOpen(false);
        setClassToEdit(null);
        fetchClasses();
      } else setError(data.message || "Failed to update class");
    } catch {
      setError("Error updating class");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !classToDelete) return;
    try {
      const res = await fetch(apiUrl(`/api/classes/${classToDelete.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Class "${classToDelete.name}" deleted successfully!`);
        fetchClasses();
      } else setError(data.message || "Failed to delete class");
    } catch {
      setError("Error deleting class");
    }
    setDeleteOpen(false);
    setClassToDelete(null);
  };

  const isAdmin = user?.role === "ADMIN";
  const filtered = classes.filter(
    (c) =>
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code?.toLowerCase().includes(search.toLowerCase()) ||
      c.teacher?.name.toLowerCase().includes(search.toLowerCase()) ||
      c.description?.toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filtered.slice((page - 1) * perPage, page * perPage);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Class Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Manage classes and course sections</Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {isAdmin && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>Create New Class</Typography>
            <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 640 }}>
              <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
                <TextField
                  label="Class Name"
                  required
                  fullWidth
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Grade 10A"
                />
                <TextField
                  label="Class Code"
                  fullWidth
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., CS101-F24"
                />
              </Box>
              <Box sx={{ mb: 2, width: "100%" }}>
                <SearchableSelect
                  label="Assigned Teacher"
                  value={formData.teacher_id}
                  onChange={(v) => setFormData({ ...formData, teacher_id: v })}
                  options={teachers.map((t) => ({ id: t.id, label: `${t.name} (${t.role})` }))}
                  emptyLabel="Select a teacher (optional)"
                  width="100%"
                  disabled={loadingTeachers}
                  loading={loadingTeachers}
                />
              </Box>
              <TextField
                label="Description"
                multiline
                rows={4}
                fullWidth
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description of the class or course section"
                sx={{ mb: 2 }}
              />
              <Button type="submit" variant="contained" disabled={submitting || !formData.name.trim()}>
                {submitting ? "Creating..." : "Create Class"}
              </Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>All Classes ({filtered.length})</Typography>
            <TextField
              size="small"
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
              sx={{ maxWidth: 300 }}
            />
          </Box>
          {loading ? (
            <Typography>Loading classes...</Typography>
          ) : classes.length === 0 ? (
            <Typography color="text.secondary">No classes found. {isAdmin && "Create one to get started!"}</Typography>
          ) : filtered.length === 0 ? (
            <Typography color="text.secondary">No classes match your search.</Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Name</strong></TableCell>
                      <TableCell><strong>Code</strong></TableCell>
                      <TableCell><strong>Teacher</strong></TableCell>
                      <TableCell><strong>Description</strong></TableCell>
                      <TableCell><strong>Created</strong></TableCell>
                      {isAdmin && <TableCell><strong>Actions</strong></TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.code || "-"}</TableCell>
                        <TableCell>{c.teacher ? c.teacher.name : "Unassigned"}</TableCell>
                        <TableCell>{c.description || "-"}</TableCell>
                        <TableCell>{new Date(c.created_at).toLocaleDateString()}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button size="small" variant="outlined" onClick={() => openEdit(c)} sx={{ mr: 1 }}>Edit</Button>
                            <Button size="small" color="error" variant="outlined" onClick={() => { setClassToDelete({ id: c.id, name: c.name }); setDeleteOpen(true); }}>Delete</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
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

      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Class</DialogTitle>
        <form onSubmit={handleEditSubmit}>
          <DialogContent>
            {classToEdit && (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
                <TextField
                  label="Class Name"
                  required
                  fullWidth
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  placeholder="e.g., Grade 10A"
                />
                <TextField
                  label="Class Code"
                  fullWidth
                  value={editFormData.code}
                  onChange={(e) => setEditFormData({ ...editFormData, code: e.target.value })}
                  placeholder="e.g., CS101-F24"
                />
                <SearchableSelect
                  label="Assigned Teacher"
                  value={editFormData.teacher_id}
                  onChange={(v) => setEditFormData({ ...editFormData, teacher_id: v })}
                  options={teachers.map((t) => ({ id: t.id, label: `${t.name} (${t.role})` }))}
                  emptyLabel="Select a teacher (optional)"
                  width="100%"
                  disabled={loadingTeachers}
                  loading={loadingTeachers}
                />
                <TextField
                  label="Description"
                  multiline
                  rows={3}
                  fullWidth
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  placeholder="Optional description"
                />
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting || !editFormData.name.trim()}>
              {submitting ? "Saving..." : "Save Changes"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Class</DialogTitle>
        <DialogContent>
          {classToDelete && <Typography>Are you sure you want to delete <strong>{classToDelete.name}</strong>? This cannot be undone.</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
