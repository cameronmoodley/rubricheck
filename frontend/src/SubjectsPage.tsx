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
  Checkbox,
} from "@mui/material";
import { Search } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";
import { SearchableSelect } from "./components/SearchableSelect";

type Subject = { id: string; name: string; code: string | null; created_at: string };
type Class = { id: string; name: string; code: string | null };

export default function SubjectsPage() {
  const { user, token } = useAuth();
  const [classes, setClasses] = useState<Class[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [assignedSubjects, setAssignedSubjects] = useState<Subject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ name: "", code: "" });
  const [creating, setCreating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [subjectToRemove, setSubjectToRemove] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const fetchClasses = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch("/api/classes", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setClasses((await res.json()).classes || []);
    } catch {
      console.error("Error fetching classes");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllSubjects = async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/subjects", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAllSubjects((await res.json()).subjects || []);
    } catch {
      console.error("Error fetching subjects");
    }
  };

  const fetchClassSubjects = async (classId: string) => {
    if (!token) return;
    try {
      setLoadingSubjects(true);
      const res = await fetch(`/api/classes/${classId}/subjects`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAssignedSubjects((await res.json()).subjects || []);
    } catch {
      console.error("Error fetching class subjects");
    } finally {
      setLoadingSubjects(false);
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchAllSubjects();
  }, [token]);

  useEffect(() => {
    if (selectedClassId) fetchClassSubjects(selectedClassId);
    else setAssignedSubjects([]);
  }, [selectedClassId]);

  const handleAssign = async () => {
    if (!token || !selectedClassId || selectedSubjects.length === 0) return;
    try {
      setSubmitting(true);
      setSuccess("");
      setError("");
      const res = await fetch(`/api/classes/${selectedClassId}/subjects`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ subject_ids: selectedSubjects }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || "Subjects assigned!");
        setSelectedSubjects([]);
        fetchClassSubjects(selectedClassId);
      } else setError(data.message || "Failed to assign");
    } catch {
      setError("Error assigning subjects");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !subjectForm.name.trim()) {
      setError("Subject name is required");
      return;
    }
    try {
      setCreating(true);
      setSuccess("");
      setError("");
      const res = await fetch("/api/subjects/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(subjectForm),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Subject "${subjectForm.name}" created!`);
        setSubjectForm({ name: "", code: "" });
        fetchAllSubjects();
      } else setError(data.message || "Failed to create");
    } catch {
      setError("Error creating subject");
    } finally {
      setCreating(false);
    }
  };

  const confirmDelete = async () => {
    if (!token || !subjectToDelete) return;
    try {
      const res = await fetch(`/api/subjects/${subjectToDelete.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Subject "${subjectToDelete.name}" deleted!`);
        fetchAllSubjects();
        if (selectedClassId) fetchClassSubjects(selectedClassId);
      } else setError(data.message || "Failed to delete");
    } catch {
      setError("Error deleting subject");
    }
    setDeleteOpen(false);
    setSubjectToDelete(null);
  };

  const confirmRemove = async () => {
    if (!token || !selectedClassId || !subjectToRemove) return;
    try {
      const res = await fetch(`/api/classes/${selectedClassId}/subjects/${subjectToRemove.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Subject "${subjectToRemove.name}" removed!`);
        fetchClassSubjects(selectedClassId);
      } else setError(data.message || "Failed to remove");
    } catch {
      setError("Error removing subject");
    }
    setRemoveOpen(false);
    setSubjectToRemove(null);
  };

  const toggleSubject = (id: string) => {
    setSelectedSubjects((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const isAdmin = user?.role === "ADMIN";
  const assignedIds = assignedSubjects.map((s) => s.id);
  const availableSubjects = allSubjects.filter((s) => !assignedIds.includes(s.id));
  const filteredSubjects = allSubjects.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code?.toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filteredSubjects.slice((page - 1) * perPage, page * perPage);
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Subject Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Create subjects and assign them to classes</Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      {isAdmin && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>Create New Subject</Typography>
            <Box component="form" onSubmit={handleCreateSubject} sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
              <TextField label="Subject Name" required value={subjectForm.name} onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })} placeholder="e.g., Mathematics" sx={{ minWidth: 200 }} />
              <TextField label="Subject Code" value={subjectForm.code} onChange={(e) => setSubjectForm({ ...subjectForm, code: e.target.value })} placeholder="e.g., MATH101" sx={{ minWidth: 150 }} />
              <Button type="submit" variant="contained" disabled={creating || !subjectForm.name.trim()}>{creating ? "Creating..." : "Create Subject"}</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>All Subjects ({filteredSubjects.length})</Typography>
            <TextField size="small" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }} sx={{ maxWidth: 300 }} />
          </Box>
          {allSubjects.length === 0 ? (
            <Typography color="text.secondary">No subjects found. {isAdmin && "Create one to get started!"}</Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Subject Name</strong></TableCell>
                      <TableCell><strong>Code</strong></TableCell>
                      <TableCell><strong>Created</strong></TableCell>
                      {isAdmin && <TableCell><strong>Actions</strong></TableCell>}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.code || "-"}</TableCell>
                        <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                        {isAdmin && (
                          <TableCell>
                            <Button size="small" color="error" variant="outlined" onClick={() => { setSubjectToDelete({ id: s.id, name: s.name }); setDeleteOpen(true); }}>Delete</Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                <Pagination count={Math.ceil(filteredSubjects.length / perPage)} page={page} onChange={(_, p) => setPage(p)} color="primary" />
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>Assign Subjects to Class</Typography>
          {loading ? (
            <Typography>Loading classes...</Typography>
          ) : classes.length === 0 ? (
            <Typography color="text.secondary">No classes found. Create a class first.</Typography>
          ) : (
            <Box sx={{ mb: 2 }}>
              <SearchableSelect
                label="Select a class"
                value={selectedClassId}
                onChange={setSelectedClassId}
                options={classes.map((c) => ({ id: c.id, label: `${c.name}${c.code ? ` (${c.code})` : ""}` }))}
                emptyLabel="Select a class"
                width={320}
              />
            </Box>
          )}
        </CardContent>
      </Card>

      {selectedClassId && (
        <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          <Card sx={{ flex: 1, minWidth: 300 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Assigned Subjects ({assignedSubjects.length})</Typography>
              {loadingSubjects ? (
                <Typography>Loading...</Typography>
              ) : assignedSubjects.length === 0 ? (
                <Typography color="text.secondary">No subjects assigned yet.</Typography>
              ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Subject Name</strong></TableCell>
                        <TableCell><strong>Code</strong></TableCell>
                        {isAdmin && <TableCell><strong>Actions</strong></TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {assignedSubjects.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>{s.name}</TableCell>
                          <TableCell>{s.code || "-"}</TableCell>
                          {isAdmin && (
                            <TableCell>
                              <Button size="small" color="error" variant="outlined" onClick={() => { setSubjectToRemove({ id: s.id, name: s.name }); setRemoveOpen(true); }}>Remove</Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
          {isAdmin && (
            <Card sx={{ flex: 1, minWidth: 300 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={600} gutterBottom>Add Subjects ({availableSubjects.length} available)</Typography>
                {availableSubjects.length === 0 ? (
                  <Typography color="text.secondary">All subjects are already assigned.</Typography>
                ) : (
                  <>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      Select subjects to assign to <strong>{selectedClass?.name}</strong>
                      {selectedSubjects.length > 0 && ` (${selectedSubjects.length} selected)`}
                    </Typography>
                    <TableContainer component={Paper} variant="outlined">
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox"><strong>Select</strong></TableCell>
                            <TableCell><strong>Subject Name</strong></TableCell>
                            <TableCell><strong>Code</strong></TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {availableSubjects.map((s) => (
                            <TableRow key={s.id}>
                              <TableCell padding="checkbox">
                                <Checkbox checked={selectedSubjects.includes(s.id)} onChange={() => toggleSubject(s.id)} />
                              </TableCell>
                              <TableCell>{s.name}</TableCell>
                              <TableCell>{s.code || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                    <Button variant="contained" onClick={handleAssign} disabled={submitting || selectedSubjects.length === 0} sx={{ mt: 2 }}>
                      {submitting ? "Assigning..." : `Assign ${selectedSubjects.length} Subject(s)`}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </Box>
      )}

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Subject</DialogTitle>
        <DialogContent>
          {subjectToDelete && <Typography>Are you sure you want to delete <strong>{subjectToDelete.name}</strong>? This will remove it from all classes.</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={removeOpen} onClose={() => setRemoveOpen(false)}>
        <DialogTitle>Remove Subject from Class</DialogTitle>
        <DialogContent>
          {subjectToRemove && selectedClassId && (
            <Typography>Remove <strong>{subjectToRemove.name}</strong> from <strong>{classes.find((c) => c.id === selectedClassId)?.name}</strong>?</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveOpen(false)}>Cancel</Button>
          <Button onClick={confirmRemove} color="error" variant="contained">Remove</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
