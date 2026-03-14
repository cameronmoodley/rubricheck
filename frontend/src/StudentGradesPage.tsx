import { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { ExpandMore } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";

type Grade = {
  id: string;
  studentName: string;
  score: number;
  goodComments: string;
  badComments: string;
  gradedAt: string;
  paperFilename: string;
  subjectName: string;
  subjectCode?: string;
};

export default function StudentGradesPage() {
  const { token } = useAuth();
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/my-grades", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setGrades(d.grades || []))
      .catch(() => setError("Failed to load grades"))
      .finally(() => setLoading(false));
  }, [token]);

  const getScoreBadge = (score: number) => {
    if (score >= 90) return { label: "A", color: "success" as const };
    if (score >= 80) return { label: "B", color: "info" as const };
    if (score >= 70) return { label: "C", color: "warning" as const };
    if (score >= 60) return { label: "D", color: "warning" as const };
    return { label: "F", color: "error" as const };
  };

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        My Grades
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        View your graded assignments and feedback
      </Typography>

      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}

      {loading ? (
        <Typography>Loading...</Typography>
      ) : grades.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: "center", py: 6 }}>
            <Typography variant="h6" color="text.secondary">
              No grades yet
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Your graded assignments will appear here once your teacher has reviewed them.
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
              Graded Assignments ({grades.length})
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Subject</strong></TableCell>
                    <TableCell><strong>Paper</strong></TableCell>
                    <TableCell><strong>Score</strong></TableCell>
                    <TableCell><strong>Grade</strong></TableCell>
                    <TableCell><strong>Graded At</strong></TableCell>
                    <TableCell><strong>Feedback</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {grades.map((g) => {
                    const badge = getScoreBadge(g.score);
                    return (
                      <TableRow key={g.id}>
                        <TableCell>{g.subjectName}{g.subjectCode ? ` (${g.subjectCode})` : ""}</TableCell>
                        <TableCell>{g.paperFilename || "—"}</TableCell>
                        <TableCell>{g.score}</TableCell>
                        <TableCell><Chip label={badge.label} color={badge.color} size="small" /></TableCell>
                        <TableCell>{formatDate(g.gradedAt)}</TableCell>
                        <TableCell>
                          {(g.goodComments || g.badComments) ? (
                            <Accordion disableGutters elevation={0} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                              <AccordionSummary expandIcon={<ExpandMore />}>
                                <Typography variant="body2">View feedback</Typography>
                              </AccordionSummary>
                              <AccordionDetails>
                                {g.goodComments && (
                                  <Box sx={{ mb: 1 }}>
                                    <Typography variant="caption" color="text.secondary">What went well:</Typography>
                                    <Typography variant="body2">{g.goodComments}</Typography>
                                  </Box>
                                )}
                                {g.badComments && (
                                  <Box>
                                    <Typography variant="caption" color="text.secondary">Areas to improve:</Typography>
                                    <Typography variant="body2">{g.badComments}</Typography>
                                  </Box>
                                )}
                              </AccordionDetails>
                            </Accordion>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}
