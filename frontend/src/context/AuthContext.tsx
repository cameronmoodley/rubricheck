import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AuthContext } from "./AuthContextTypes";
import type { User } from "./AuthContextTypes";
import { apiUrl } from "../lib/api";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const validateToken = async (token: string) => {
      try {
        const response = await fetch(apiUrl("/api/auth/validate"), {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok) {
          throw new Error("Token validation failed");
        }
        const data = await response.json();
        return { isValid: data.isValid, user: data.user };
      } catch {
        return { isValid: false, user: null };
      }
    };

    const initAuth = async () => {
      const storedToken = localStorage.getItem("token");
      const storedUser = localStorage.getItem("user");

      if (storedToken && storedUser) {
        try {
          const { isValid, user: validatedUser } = await validateToken(
            storedToken
          );
          if (!isValid) {
            throw new Error("Token is invalid or expired");
          }
          setToken(storedToken);
          setUser(validatedUser || JSON.parse(storedUser));
          setError(null);
        } catch (error) {
          console.error("Auth initialization error:", error);
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setError(
            error instanceof Error ? error.message : "Authentication failed"
          );
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, [navigate]);

  const login = async (newToken: string, newUser: User) => {
    try {
      setIsLoading(true);
      setError(null);

      // Store credentials first
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem("token", newToken);
      localStorage.setItem("user", JSON.stringify(newUser));

      // Navigate after successful login
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setError(null);
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token && !!user,
        isLoading,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default AuthProvider;
