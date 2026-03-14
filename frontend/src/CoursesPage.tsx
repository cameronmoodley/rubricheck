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
} from "@mui/material";
import { MenuBook } from "@mui/icons-material";
import { apiUrl } from "./lib/api";

type Subject = { id: string; name: string; code?: string };

export default function CoursesPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch(apiUrl("/api/subjects"));
    if (!res.ok) return;
    const data = await res.json();
    setSubjects(data.subjects || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/subjects"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code: code || undefined }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      setName("");
      setCode("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create subject");
    }
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Courses</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Create and manage your courses for paper grading
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>Add New Course</Typography>
          <Box component="form" onSubmit={onCreate} sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-end" }}>
            <TextField label="Course Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter course name" sx={{ minWidth: 250 }} />
            <TextField label="Course Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g., CS101" sx={{ minWidth: 150 }} />
            <Button type="submit" variant="contained">Add Course</Button>
          </Box>
          {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>All Courses ({subjects.length})</Typography>
          {subjects.length === 0 ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <Typography variant="h3" color="text.disabled" sx={{ mb: 2 }}>📚</Typography>
              <Typography variant="h6" color="text.secondary">No courses yet</Typography>
              <Typography color="text.secondary">Create your first course to get started</Typography>
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Course Name</strong></TableCell>
                    <TableCell><strong>Code</strong></TableCell>
                    <TableCell><strong>Created</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {subjects.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                          <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: "primary.light", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <MenuBook />
                          </Box>
                          {s.name}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {s.code ? (
                          <Box component="span" sx={{ px: 1.5, py: 0.5, borderRadius: 1, bgcolor: "success.light", color: "success.dark", fontSize: "0.875rem", fontWeight: 500 }}>
                            {s.code}
                          </Box>
                        ) : (
                          <Typography color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell><Typography color="text.secondary">—</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
