import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  CircularProgress,
} from "@mui/material";
import { SearchableSelect } from "./components/SearchableSelect";
import { ExpandMore, Person, Description } from "@mui/icons-material";

type GradeRow = {
  id: string;
  studentName: string | null;
  score: number;
  goodComments: string;
  badComments: string;
  gradedAt: string;
  paperFilename: string | null;
  uploadedAt: string;
  subjectName: string | null;
  subjectCode: string | null;
};

export default function GradesPage() {
  const [rows, setRows] = useState<GradeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [subjectId, setSubjectId] = useState("");

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const params = subjectId ? `?subjectId=${encodeURIComponent(subjectId)}` : "";
        const res = await fetch(`/api/grades${params}`);
        if (!res.ok) throw new Error(`Failed to load grades (${res.status})`);
        const data = (await res.json()) as { grades: GradeRow[] };
        setRows(data.grades);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load grades");
      } finally {
        setLoading(false);
      }
    })();
  }, [subjectId]);

  useEffect(() => {
    fetch("/api/subjects")
      .then((r) => r.json())
      .then((d) => setSubjects((d.subjects || []).map((s: { id: string; name: string }) => ({ id: s.id, name: s.name }))))
      .catch(() => {});
  }, []);

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Student Grades</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Review and manage graded student submissions
      </Typography>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={600} gutterBottom>Filter by Subject</Typography>
          <SearchableSelect
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            options={subjects.map((s) => ({ id: s.id, label: s.name }))}
            emptyLabel="All subjects"
            width={320}
          />
        </CardContent>
      </Card>

      {loading && (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <CircularProgress sx={{ mb: 2 }} />
            <Typography color="text.secondary">Loading grades...</Typography>
          </CardContent>
        </Card>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!loading && !error && (
        <Box>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>Graded Papers ({rows.length})</Typography>
          {rows.length === 0 ? (
            <Card>
              <CardContent sx={{ textAlign: "center", py: 6 }}>
                <Typography variant="h3" color="text.disabled" sx={{ mb: 2 }}>📊</Typography>
                <Typography variant="h6" color="text.secondary">No grades yet</Typography>
                <Typography color="text.secondary">Upload papers to see grades here</Typography>
              </CardContent>
            </Card>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {rows.map((r) => (
                <Accordion key={r.id} variant="outlined">
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, flex: 1 }}>
                      <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: "primary.light", color: "primary.contrastText", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Person />
                      </Box>
                      <Box>
                        <Typography fontWeight={600}>{r.studentName ?? "Unknown Student"}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          <Description sx={{ fontSize: 14, verticalAlign: "middle", mr: 0.5 }} />
                          {r.paperFilename ?? r.id}
                        </Typography>
                      </Box>
                      <Chip label={`${r.score}%`} color="primary" sx={{ ml: "auto" }} />
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {r.goodComments && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} color="success.main" gutterBottom>✓ What went well</Typography>
                        <Box sx={{ p: 2, bgcolor: "success.50", borderRadius: 1, border: "1px solid", borderColor: "success.200" }}>
                          <Typography variant="body2" color="success.dark">{r.goodComments}</Typography>
                        </Box>
                      </Box>
                    )}
                    {r.badComments && (
                      <Box sx={{ mb: 2 }}>
                        <Typography variant="subtitle2" fontWeight={600} color="error.main" gutterBottom>⚠ What to improve</Typography>
                        <Box sx={{ p: 2, bgcolor: "error.50", borderRadius: 1, border: "1px solid", borderColor: "error.200" }}>
                          <Typography variant="body2" color="error.dark">{r.badComments}</Typography>
                        </Box>
                      </Box>
                    )}
                    <Typography variant="caption" color="text.secondary">
                      Graded on {new Date(r.gradedAt).toLocaleString()}
                    </Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
