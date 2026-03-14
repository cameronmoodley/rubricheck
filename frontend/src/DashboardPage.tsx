import { useEffect, useState } from "react";
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Pagination,
  CircularProgress,
  Alert,
  LinearProgress,
} from "@mui/material";
import {
  MenuBook,
  TrendingUp,
  Schedule,
  People,
  CheckCircle,
  Error as ErrorIcon,
  Info,
  Category,
  Edit,
  Visibility,
} from "@mui/icons-material";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { useAuth } from "./hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { HIDE_MOODLE } from "./config";
import { apiUrl } from "./lib/api";
import { SearchableSelect } from "./components/SearchableSelect";

type Class = { id: string; name: string; code: string | null; teacher?: { id: string; name: string; email: string } | null };
type PerformanceData = {
  stats: { totalPapersGraded: number; uniqueStudents: number; classAverage: number; papersThisWeek: number };
  gradeDistribution: { A: number; B: number; C: number; D: number; F: number };
  subjectAverages: Array<{ subject: string; average: number; count: number }>;
  topStudents: Array<{ name: string; average: number; paperCount: number }>;
  activityData: Array<{ week: string; count: number }>;
};

const GRADE_COLORS: Record<string, string> = {
  A: "#00D084", B: "#0066CC", C: "#FF9500", D: "#00B4D8", F: "#FF4444",
};

type MoodleCourse = {
  id: number;
  fullname: string;
  shortname: string;
  categoryid: number;
  categoryname: string;
  visible: number;
};

type MoodleQuiz = {
  id: number;
  name: string;
  course: number;
  coursemodule: number;
  intro: string;
  timeopen: number;
  timeclose: number;
};

const StatCard = ({
  icon,
  label,
  value,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  loading?: boolean;
}) => (
  <Card sx={{ height: "100%" }}>
    <CardContent>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        <Box sx={{ color: "primary.main" }}>{icon}</Box>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
      </Box>
      {loading ? (
        <CircularProgress size={24} />
      ) : (
        <Typography variant="h4" fontWeight={700}>
          {value}
        </Typography>
      )}
    </CardContent>
  </Card>
);

export default function DashboardPage() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [moodleStatus, setMoodleStatus] = useState<"loading" | "success" | "failure">("loading");
  const [courses, setCourses] = useState<MoodleCourse[]>([]);
  const [quizzes, setQuizzes] = useState<MoodleQuiz[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;
  const [stats, setStats] = useState({
    totalCourses: 0,
    totalGraded: 0,
    gradedThisWeek: 0,
    studentsGraded: 0,
  });
  const [loadingStats, setLoadingStats] = useState(false);
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingPerformance, setLoadingPerformance] = useState(false);
  const [performanceData, setPerformanceData] = useState<PerformanceData | null>(null);
  const [perfError, setPerfError] = useState("");

  const makeMoodleRequest = async (
    wsfunction: string,
    additionalParams: Record<string, string> = {}
  ) => {
    if (HIDE_MOODLE) throw new Error("Moodle disabled");
    const moodleUrl = import.meta.env.VITE_MOODLE_WEB_SERVICE_URL;
    const token = import.meta.env.VITE_WSTOKEN;
    if (!moodleUrl || !token) throw new Error("Missing Moodle URL or token");
    const formData = new FormData();
    formData.append("wstoken", token);
    formData.append("wsfunction", wsfunction);
    formData.append("moodlewsrestformat", "json");
    Object.entries(additionalParams).forEach(([k, v]) => formData.append(k, v));
    const res = await fetch(moodleUrl, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  };

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;
      try {
        setLoadingStats(true);
        const res = await fetch(apiUrl("/api/dashboard/stats"), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error("Failed to fetch dashboard stats:", e);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [token]);

  useEffect(() => {
    if (!token || (user?.role !== "ADMIN" && user?.role !== "TEACHER")) return;
    fetch(apiUrl("/api/classes"), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setClasses(d.classes || []))
      .catch(() => setPerfError("Failed to fetch classes"))
      .finally(() => setLoadingClasses(false));
  }, [token, user?.role]);

  useEffect(() => {
    if (!selectedClassId || !token) {
      setPerformanceData(null);
      return;
    }
    setLoadingPerformance(true);
    setPerfError("");
    fetch(apiUrl(`/api/classes/${selectedClassId}/performance`), { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setPerformanceData(d))
      .catch((e) => setPerfError(e.message || "Failed to fetch performance"))
      .finally(() => setLoadingPerformance(false));
  }, [selectedClassId, token]);

  useEffect(() => {
    if (HIDE_MOODLE) return;
    let mounted = true;
    const fetchCoursesAndStatus = async () => {
      try {
        setLoadingCourses(true);
        await makeMoodleRequest("core_webservice_get_site_info");
        if (!mounted) return;
        setMoodleStatus("success");
        const data = await makeMoodleRequest("core_course_get_courses");
        if (!mounted) return;
        const filtered = (data || []).filter((c: MoodleCourse) => c.id !== 1);
        setCourses(filtered);
      } catch (e) {
        if (!mounted) return;
        console.error("Moodle error:", e);
        setMoodleStatus("failure");
        setCourses([]);
      } finally {
        if (mounted) setLoadingCourses(false);
      }
    };
    fetchCoursesAndStatus();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (HIDE_MOODLE || courses.length === 0) {
      if (courses.length === 0) setQuizzes([]);
      return;
    }
    const formData = new FormData();
    formData.append("wstoken", import.meta.env.VITE_WSTOKEN);
    formData.append("wsfunction", "mod_quiz_get_quizzes_by_courses");
    formData.append("moodlewsrestformat", "json");
    courses.forEach((c, i) => formData.append(`courseids[${i}]`, c.id.toString()));
    fetch(import.meta.env.VITE_MOODLE_WEB_SERVICE_URL, { method: "POST", body: formData })
      .then((r) => r.json())
      .then((d) => setQuizzes(d.quizzes || []))
      .catch(() => setQuizzes([]))
      .finally(() => setLoadingQuizzes(false));
    setLoadingQuizzes(true);
  }, [courses]);

  const coursesWithQuizCount = courses.map((c) => ({
    ...c,
    quizCount: quizzes.filter((q) => q.course === c.id).length,
  }));
  const startIndex = (page - 1) * perPage;
  const paginatedCourses = coursesWithQuizCount.slice(startIndex, startIndex + perPage);

  const gradeChartData = performanceData
    ? [
        { name: "A (90–100)", value: performanceData.gradeDistribution.A, color: GRADE_COLORS.A },
        { name: "B (80–89)", value: performanceData.gradeDistribution.B, color: GRADE_COLORS.B },
        { name: "C (70–79)", value: performanceData.gradeDistribution.C, color: GRADE_COLORS.C },
        { name: "D (60–69)", value: performanceData.gradeDistribution.D, color: GRADE_COLORS.D },
        { name: "F (below 60)", value: performanceData.gradeDistribution.F, color: GRADE_COLORS.F },
      ].filter((d) => d.value > 0)
    : [];
  const subjectChartData = performanceData?.subjectAverages.map((s) => ({ name: s.subject, average: s.average })) || [];
  const activityChartData = performanceData?.activityData || [];

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>
        Welcome, {user?.name || "Teacher"}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        RubriCheck Dashboard – Your AI-powered grading assistant
        {user?.role === "ADMIN" && " (Admin Mode)"}
      </Typography>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard icon={<MenuBook />} label="Total Courses" value={stats.totalCourses} loading={loadingStats} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard icon={<TrendingUp />} label="Total Papers Graded" value={stats.totalGraded} loading={loadingStats} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard icon={<Schedule />} label="Graded This Week" value={stats.gradedThisWeek} loading={loadingStats} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <StatCard icon={<People />} label="Students Graded" value={stats.studentsGraded} loading={loadingStats} />
        </Grid>
      </Grid>

      {(user?.role === "ADMIN" || user?.role === "TEACHER") && (
        <>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 2, mb: 2 }}>
            <Typography variant="h6" fontWeight={600}>Class Performance</Typography>
            <SearchableSelect
              label="Select a class"
              value={selectedClassId}
              onChange={setSelectedClassId}
              options={classes.map((c) => ({
                id: c.id,
                label: `${c.name}${c.code ? ` (${c.code})` : ""}${c.teacher ? ` - ${c.teacher.name}` : ""}`,
              }))}
              emptyLabel="Choose a class..."
              width={320}
              disabled={loadingClasses}
              loading={loadingClasses}
            />
          </Box>
          {perfError && <Alert severity="error" sx={{ mb: 2 }}>{perfError}</Alert>}
          {selectedClassId && (
            loadingPerformance ? (
              <Card sx={{ mb: 4 }}><CardContent><Typography>Loading performance data...</Typography></CardContent></Card>
            ) : performanceData ? (
              <>
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="body2" color="text.secondary">Papers Graded</Typography>
                      <Typography variant="h4" fontWeight={700}>{performanceData.stats.totalPapersGraded}</Typography>
                    </CardContent></Card>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="body2" color="text.secondary">Unique Students</Typography>
                      <Typography variant="h4" fontWeight={700}>{performanceData.stats.uniqueStudents}</Typography>
                    </CardContent></Card>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="body2" color="text.secondary">Class Average</Typography>
                      <Typography variant="h4" fontWeight={700}>{performanceData.stats.classAverage.toFixed(1)}%</Typography>
                    </CardContent></Card>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="body2" color="text.secondary">This Week</Typography>
                      <Typography variant="h4" fontWeight={700}>{performanceData.stats.papersThisWeek}</Typography>
                    </CardContent></Card>
                  </Grid>
                </Grid>
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>Grade Distribution</Typography>
                      <Box sx={{ height: 280 }}>
                        {gradeChartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={gradeChartData} cx="50%" cy="45%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" minAngle={4}>
                                {gradeChartData.map((e, i) => <Cell key={i} fill={e.color} stroke={e.color} strokeWidth={1} />)}
                              </Pie>
                              <Tooltip formatter={(v: number, n: string) => [`${v} paper${v !== 1 ? "s" : ""}`, n]} />
                              <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                          </ResponsiveContainer>
                        ) : (
                          <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No grade data yet.</Typography>
                        )}
                      </Box>
                    </CardContent></Card>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>Average Score by Subject</Typography>
                      {subjectChartData.length > 0 ? (
                        <Box sx={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={subjectChartData} margin={{ top: 20, right: 20, left: 20, bottom: 60 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} />
                              <YAxis domain={[0, 100]} />
                              <Tooltip />
                              <Bar dataKey="average" fill="#0066CC" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </Box>
                      ) : (
                        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No subject data yet.</Typography>
                      )}
                    </CardContent></Card>
                  </Grid>
                </Grid>
                <Grid container spacing={3} sx={{ mb: 4 }}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>Grading Activity (Last 8 Weeks)</Typography>
                      {activityChartData.length > 0 ? (
                        <Box sx={{ height: 280 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={activityChartData} margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="week" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Line type="monotone" dataKey="count" stroke="#0066CC" strokeWidth={2} dot={{ r: 4 }} name="Papers Graded" />
                            </LineChart>
                          </ResponsiveContainer>
                        </Box>
                      ) : (
                        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No activity data yet.</Typography>
                      )}
                    </CardContent></Card>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Card sx={{ height: "100%" }}><CardContent>
                      <Typography variant="h6" fontWeight={600} gutterBottom>Top 10 Students</Typography>
                      {performanceData.topStudents.length > 0 ? (
                        <TableContainer component={Paper} variant="outlined">
                          <Table size="small">
                            <TableHead>
                              <TableRow>
                                <TableCell><strong>Rank</strong></TableCell>
                                <TableCell><strong>Student</strong></TableCell>
                                <TableCell><strong>Average</strong></TableCell>
                                <TableCell><strong>Papers</strong></TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {performanceData.topStudents.map((s, i) => (
                                <TableRow key={s.name}>
                                  <TableCell>#{i + 1}</TableCell>
                                  <TableCell>{s.name}</TableCell>
                                  <TableCell>
                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                      <LinearProgress variant="determinate" value={s.average} sx={{ flex: 1, height: 8, borderRadius: 1 }} color={s.average >= 90 ? "success" : s.average >= 70 ? "primary" : "warning"} />
                                      <Typography variant="body2">{s.average}%</Typography>
                                    </Box>
                                  </TableCell>
                                  <TableCell>{s.paperCount}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </TableContainer>
                      ) : (
                        <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>No student data yet.</Typography>
                      )}
                    </CardContent></Card>
                  </Grid>
                </Grid>
              </>
            ) : (
              <Card sx={{ mb: 4 }}><CardContent><Typography color="text.secondary">No performance data for this class yet.</Typography></CardContent></Card>
            )
          )}
        </>
      )}

      {!HIDE_MOODLE && (
        <>
          <Typography variant="h6" fontWeight={600} sx={{ mb: 2 }}>
            Moodle Integration
          </Typography>
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    {moodleStatus === "loading" && <Info color="info" />}
                    {moodleStatus === "success" && <CheckCircle color="success" />}
                    {moodleStatus === "failure" && <ErrorIcon color="error" />}
                    <Typography variant="body2" color="text.secondary">Moodle Status</Typography>
                  </Box>
                  <Typography variant="h6" fontWeight={600}>
                    {moodleStatus === "loading" && "Connecting..."}
                    {moodleStatus === "success" && "Connected"}
                    {moodleStatus === "failure" && "Disconnected"}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <StatCard icon={<Category />} label="Moodle Courses" value={courses.length} loading={loadingCourses} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <StatCard icon={<Edit />} label="Moodle Quizzes" value={quizzes.length} loading={loadingQuizzes} />
            </Grid>
          </Grid>

          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Available Courses ({courses.length})
              </Typography>
              {loadingCourses ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress />
                </Box>
              ) : courses.length === 0 ? (
                <Typography color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
                  No courses found
                </Typography>
              ) : (
                <>
                  <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Course Name</strong></TableCell>
                          <TableCell><strong>Short Name</strong></TableCell>
                          <TableCell><strong>Quizzes</strong></TableCell>
                          <TableCell><strong>ID</strong></TableCell>
                          <TableCell align="right"><strong>Actions</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {paginatedCourses.map((course) => (
                          <TableRow key={course.id}>
                            <TableCell>{course.fullname}</TableCell>
                            <TableCell>{course.shortname}</TableCell>
                            <TableCell>{loadingQuizzes ? "..." : course.quizCount}</TableCell>
                            <TableCell>{course.id}</TableCell>
                            <TableCell align="right">
                              <Button
                                variant="contained"
                                size="small"
                                startIcon={<Visibility />}
                                onClick={() => navigate(`/quiz?course=${course.id}`)}
                              >
                                View Quizzes
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                    <Pagination
                      count={Math.ceil(coursesWithQuizCount.length / perPage)}
                      page={page}
                      onChange={(_, p) => setPage(p)}
                      color="primary"
                    />
                  </Box>
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </Box>
  );
}
