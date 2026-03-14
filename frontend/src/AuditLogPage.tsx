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
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import { useAuth } from "./hooks/useAuth";

type AuditEntry = {
  id: string;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
};

export default function AuditLogPage() {
  const { token } = useAuth();
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const limit = 50;

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String((page - 1) * limit));
    if (actionFilter) params.set("action", actionFilter);
    fetch(`/api/audit?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [token, page, actionFilter]);

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Audit Log
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Track user actions across the system
      </Typography>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>Filter by action</InputLabel>
            <Select
              value={actionFilter}
              label="Filter by action"
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            >
              <MenuItem value="">All</MenuItem>
              <MenuItem value="CREATE">Create</MenuItem>
              <MenuItem value="DELETE">Delete</MenuItem>
              <MenuItem value="UPLOAD">Upload</MenuItem>
              <MenuItem value="UPLOAD_EXAM_PROJECTS">Upload Exam Projects</MenuItem>
              <MenuItem value="PASSWORD_RESET">Password Reset</MenuItem>
            </Select>
          </FormControl>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {loading ? (
            <Typography>Loading...</Typography>
          ) : logs.length === 0 ? (
            <Typography color="text.secondary">No audit entries found.</Typography>
          ) : (
            <>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Time</strong></TableCell>
                      <TableCell><strong>User</strong></TableCell>
                      <TableCell><strong>Action</strong></TableCell>
                      <TableCell><strong>Resource</strong></TableCell>
                      <TableCell><strong>Details</strong></TableCell>
                      <TableCell><strong>IP</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>{formatDate(log.createdAt)}</TableCell>
                        <TableCell>{log.userEmail || log.userName || log.userId || "—"}</TableCell>
                        <TableCell><Chip label={log.action} size="small" /></TableCell>
                        <TableCell>{log.resource}{log.resourceId ? ` (${log.resourceId.slice(0, 8)}…)` : ""}</TableCell>
                        <TableCell sx={{ maxWidth: 200 }}>
                          {log.details && Object.keys(log.details).length > 0
                            ? JSON.stringify(log.details)
                            : "—"}
                        </TableCell>
                        <TableCell>{log.ipAddress || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {total > limit && (
                <Pagination
                  count={Math.ceil(total / limit)}
                  page={page}
                  onChange={(_, p) => setPage(p)}
                  sx={{ mt: 2, display: "flex", justifyContent: "center" }}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
