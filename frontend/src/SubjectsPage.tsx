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
  IconButton,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon, Search as SearchIcon, Edit as EditIcon } from "@mui/icons-material";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

type Subject = { id: string; name: string; code: string | null; created_at: string };

export default function SubjectsPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [subjectToDelete, setSubjectToDelete] = useState<{ id: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const fetchAllSubjects = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/api/subjects"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAllSubjects((await res.json()).subjects || []);
    } catch {
      setError("Failed to load subjects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllSubjects();
  }, [token]);

  const confirmDelete = async () => {
    if (!token || !subjectToDelete) return;
    try {
      const res = await fetch(apiUrl(`/api/subjects/${subjectToDelete.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`Subject "${subjectToDelete.name}" deleted!`);
        fetchAllSubjects();
      } else setError(data.message || "Failed to delete");
    } catch {
      setError("Error deleting subject");
    }
    setDeleteOpen(false);
    setSubjectToDelete(null);
  };

  const isAdmin = user?.role === "ADMIN";
  const filteredSubjects = allSubjects.filter(
    (s) =>
      !search ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code?.toLowerCase().includes(search.toLowerCase())
  );
  const paginated = filteredSubjects.slice((page - 1) * perPage, page * perPage);
  const pageCount = Math.max(1, Math.ceil(filteredSubjects.length / perPage));

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Subject Management
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Create and manage subjects. Assign subjects to classes when creating or editing them.
      </Typography>

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>
              All Subjects ({filteredSubjects.length})
            </Typography>
            {isAdmin && (
              <Button variant="contained" component={Link} to="/subjects/new" startIcon={<AddIcon />}>
                New Subject
              </Button>
            )}
          </Box>
          {allSubjects.length === 0 && !loading ? (
            <Typography color="text.secondary">
              No subjects found. {isAdmin && "Create one to get started!"}
            </Typography>
          ) : (
            <>
              <TextField
                size="small"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2, maxWidth: 320 }}
              />
              <TableContainer component={Paper} variant="outlined">
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell>
                        <strong>Subject Name</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Code</strong>
                      </TableCell>
                      <TableCell>
                        <strong>Created</strong>
                      </TableCell>
                      {isAdmin && (
                        <TableCell align="right" width={100}>
                          <strong>Actions</strong>
                        </TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginated.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>{s.name}</TableCell>
                        <TableCell>{s.code || "-"}</TableCell>
                        <TableCell>{new Date(s.created_at).toLocaleDateString()}</TableCell>
                        {isAdmin && (
                          <TableCell align="right">
                            <IconButton
                              size="small"
                              onClick={() => navigate(`/subjects/${s.id}/edit`)}
                              title="Edit subject"
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setSubjectToDelete({ id: s.id, name: s.name });
                                setDeleteOpen(true);
                              }}
                              title="Delete subject"
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2, flexWrap: "wrap", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? "s" : ""}
                  {search && ` matching "${search}"`}
                </Typography>
                {pageCount > 1 && (
                  <Pagination
                    count={pageCount}
                    page={page}
                    onChange={(_, p) => setPage(p)}
                    color="primary"
                    size="small"
                    showFirstButton
                    showLastButton
                  />
                )}
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete Subject</DialogTitle>
        <DialogContent>
          {subjectToDelete && (
            <Typography>
              Are you sure you want to delete <strong>{subjectToDelete.name}</strong>? This will remove it from all classes.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
