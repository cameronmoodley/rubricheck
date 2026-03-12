import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();

  // While auth state is being determined, don't render anything (or show a small loader)
  if (isLoading) return <div />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
