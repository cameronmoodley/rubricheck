import { createContext } from "react";

export type UserRole = "ADMIN" | "TEACHER" | "STUDENT";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export const AuthContext = createContext<AuthContextType | null>(null);
