import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { PrivateRoute } from "./components/PrivateRoute";
import LoginPage from "./LoginPage";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPasswordPage";
import DashboardPage from "./DashboardPage";
import GradesPage from "./GradesPage";
import CoursesPage from "./CoursesPage";
import QuizPage from "./QuizPage";
import QuizDetailPage from "./QuizDetailPage";
import ExamProjectsPage from "./ExamProjectsPage";
import ExamProjectResultsPage from "./ExamProjectResultsPage";
import UploadPage from "./UploadPage";
import UsersPage from "./UsersPage";
import ClassesPage from "./ClassesPage";
import SubjectsPage from "./SubjectsPage";
import RubricTemplatesPage from "./RubricTemplatesPage";
import AuditLogPage from "./AuditLogPage";
import StudentGradesPage from "./StudentGradesPage";
import ResultsPage from "./ResultsPage";
import ProfilePage from "./ProfilePage";

import Layout from "./components/Layout/Layout";

const App = () => {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/upload"
          element={
            <PrivateRoute>
              <Layout>
                <UploadPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/grades"
          element={
            <PrivateRoute>
              <Layout>
                <GradesPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/courses"
          element={
            <PrivateRoute>
              <Layout>
                <CoursesPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/quiz"
          element={
            <PrivateRoute>
              <Layout>
                <QuizPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/quiz/:id"
          element={
            <PrivateRoute>
              <Layout>
                <QuizDetailPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/exam-projects"
          element={
            <PrivateRoute>
              <Layout>
                <ExamProjectsPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/exam-project-results"
          element={
            <PrivateRoute>
              <Layout>
                <ExamProjectResultsPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/users"
          element={
            <PrivateRoute>
              <Layout>
                <UsersPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/classes"
          element={
            <PrivateRoute>
              <Layout>
                <ClassesPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/subjects"
          element={
            <PrivateRoute>
              <Layout>
                <SubjectsPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/rubric-templates"
          element={
            <PrivateRoute>
              <Layout>
                <RubricTemplatesPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <PrivateRoute>
              <Layout>
                <AuditLogPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/my-grades"
          element={
            <PrivateRoute>
              <Layout>
                <StudentGradesPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route path="/class-performance" element={<Navigate to="/" replace />} />
        <Route
          path="/results"
          element={
            <PrivateRoute>
              <Layout>
                <ResultsPage />
              </Layout>
            </PrivateRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <Layout>
                <ProfilePage />
              </Layout>
            </PrivateRoute>
          }
        />

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
};

export default App;
