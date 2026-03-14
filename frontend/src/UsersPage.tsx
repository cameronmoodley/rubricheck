import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Grid,
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useAuth } from "./hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "./lib/api";

type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
  created_at: string;
};

export default function UsersPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    role: "TEACHER" as "ADMIN" | "TEACHER" | "STUDENT",
  });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (user && user.role !== "ADMIN") navigate("/");
  }, [user, navigate]);

  const fetchUsers = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/api/users"), { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users || []);
      } else setError("Failed to fetch users");
    } catch {
      setError("Error fetching users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!formData.email || !formData.password || !formData.name) {
      setError("All fields are required");
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(apiUrl("/api/users/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`User ${formData.name} created successfully!`);
        setFormData({ email: "", password: "", name: "", role: "TEACHER" });
        fetchUsers();
      } else setError(data.message || "Failed to create user");
    } catch {
      setError("Error creating user");
    } finally {
      setLoading(false);
    }
  };

  const openDelete = (id: string, name: string) => {
    setUserToDelete({ id, name });
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      const res = await fetch(apiUrl(`/api/users/${userToDelete.id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(`User ${userToDelete.name} deleted successfully!`);
        fetchUsers();
      } else setError(data.message || "Failed to delete user");
    } catch {
      setError("Error deleting user");
    }
    setDeleteOpen(false);
    setUserToDelete(null);
  };

  const getRoleStyle = (role: string) => {
    switch (role) {
      case "ADMIN": return { bgcolor: "rgba(255, 68, 68, 0.12)", color: "#FF4444" };
      case "TEACHER": return { bgcolor: "rgba(0, 102, 204, 0.12)", color: "#0066CC" };
      default: return { bgcolor: "#F0F0F0", color: "#1A1A2E" };
    }
  };

  if (user?.role !== "ADMIN") return null;

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>User Management</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>Create and manage system users (Admin only)</Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Create New User</Typography>
              <Box component="form" onSubmit={handleSubmit}>
                <TextField fullWidth label="Name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} margin="normal" required placeholder="John Doe" />
                <TextField fullWidth label="Email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} margin="normal" required placeholder="john@example.com" />
                <TextField fullWidth label="Password" type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} margin="normal" required placeholder="Min 6 characters" />
                <FormControl fullWidth margin="normal" required>
                  <InputLabel>Role</InputLabel>
                  <Select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as "ADMIN" | "TEACHER" | "STUDENT" })} label="Role">
                    <MenuItem value="TEACHER">Teacher</MenuItem>
                    <MenuItem value="ADMIN">Admin</MenuItem>
                    <MenuItem value="STUDENT">Student</MenuItem>
                  </Select>
                </FormControl>
                <Button type="submit" variant="contained" disabled={loading} sx={{ mt: 2 }}>
                  {loading ? "Creating..." : "Create User"}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>Existing Users ({users.length})</Typography>
              {loading && <Typography>Loading users...</Typography>}
              {!loading && users.length === 0 && <Typography color="text.secondary">No users found</Typography>}
              {!loading && users.length > 0 && (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><strong>Name</strong></TableCell>
                        <TableCell><strong>Email</strong></TableCell>
                        <TableCell><strong>Role</strong></TableCell>
                        <TableCell><strong>Actions</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>{u.name}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell>
                            <Box component="span" sx={{ px: 1, py: 0.5, borderRadius: 1, fontSize: "0.85rem", fontWeight: 500, ...getRoleStyle(u.role) }}>
                              {u.role}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {u.id !== user?.id ? (
                              <Button size="small" color="error" variant="outlined" onClick={() => openDelete(u.id, u.name)}>Delete</Button>
                            ) : (
                              <Typography variant="caption" color="text.secondary">(You)</Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete User</DialogTitle>
        <DialogContent>
          {userToDelete && (
            <Typography>Are you sure you want to delete user <strong>{userToDelete.name}</strong>? This cannot be undone.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button onClick={confirmDelete} color="error" variant="contained">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
