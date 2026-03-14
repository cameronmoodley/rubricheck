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
  IconButton,
  InputAdornment,
  Pagination,
} from "@mui/material";
import { Add as AddIcon, Delete as DeleteIcon, Search as SearchIcon, Edit as EditIcon } from "@mui/icons-material";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./hooks/useAuth";
import { apiUrl } from "./lib/api";

type RubricTemplate = { id: string; name: string; description?: string; criteria?: Record<string, { maxScore: number; description: string }> };

export default function RubricTemplatesPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<RubricTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<RubricTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [templateSearch, setTemplateSearch] = useState("");
  const [templatePage, setTemplatePage] = useState(1);
  const templatesPerPage = 10;

  const fetchData = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/api/rubric-templates/all"), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch {
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const confirmDelete = async () => {
    if (!token || !templateToDelete) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(apiUrl(`/api/rubric-templates/${templateToDelete.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(data.message || "Template deleted");
        setDeleteOpen(false);
        setTemplateToDelete(null);
        fetchData();
      } else setError(data.error || "Failed to delete");
    } catch {
      setError("Failed to delete template");
    } finally {
      setDeleting(false);
    }
  };

  const filteredTemplates = templates.filter(
    (t) =>
      !templateSearch ||
      t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(templateSearch.toLowerCase())
  );
  const paginatedTemplates = filteredTemplates.slice(
    (templatePage - 1) * templatesPerPage,
    templatePage * templatesPerPage
  );
  const templatePageCount = Math.max(1, Math.ceil(filteredTemplates.length / templatesPerPage));

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Rubric Templates
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Create and manage rubric templates. Assign templates to subjects when creating or editing them.
      </Typography>

      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>{success}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Templates</Typography>
            <Button variant="contained" component={Link} to="/rubric-templates/new" startIcon={<AddIcon />}>
              New Template
            </Button>
          </Box>
          {templates.length === 0 && !loading && (
            <Typography color="text.secondary">
              No templates yet. Create one to get started, or run the database seed for predefined templates (Essay, Lab Report, etc.).
            </Typography>
          )}
          {templates.length > 0 && (
            <>
              <TextField
                size="small"
                placeholder="Search templates..."
                value={templateSearch}
                onChange={(e) => { setTemplateSearch(e.target.value); setTemplatePage(1); }}
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
                      <TableCell><strong>Name</strong></TableCell>
                      <TableCell><strong>Description</strong></TableCell>
                      <TableCell align="right" width={100}><strong>Actions</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {paginatedTemplates.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>{t.name}</TableCell>
                        <TableCell>{t.description || "-"}</TableCell>
                        <TableCell align="right">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/rubric-templates/${t.id}/edit`)}
                            title="Edit template"
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={() => {
                              setTemplateToDelete(t);
                              setDeleteOpen(true);
                            }}
                            title="Delete template"
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2, flexWrap: "wrap", gap: 1 }}>
                <Typography variant="body2" color="text.secondary">
                  {filteredTemplates.length} template{filteredTemplates.length !== 1 ? "s" : ""}
                {templateSearch && ` matching "${templateSearch}"`}
              </Typography>
              {templatePageCount > 1 && (
                <Pagination
                  count={templatePageCount}
                  page={templatePage}
                  onChange={(_, p) => setTemplatePage(p)}
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

      <Dialog open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)}>
        <DialogTitle>Delete Template</DialogTitle>
        <DialogContent>
          {templateToDelete && (
            <Typography>
              Are you sure you want to delete <strong>{templateToDelete.name}</strong>? This will remove it from all subject assignments.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)} disabled={deleting}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disabled={deleting}>
            {deleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
