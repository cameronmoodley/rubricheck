import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
} from "@mui/material";
import { Visibility, VisibilityOff } from "@mui/icons-material";
import { useAuth } from "./hooks/useAuth";
import type { User } from "./context/AuthContextTypes";
import brandImg from "./assets/logo.png";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err?.message || "Invalid credentials");
        return;
      }

      const data = (await res.json()) as { token: string; user: User };
      if (data?.token && data?.user) {
        login(data.token, data.user);
        navigate("/");
      } else {
        setError("Login failed: invalid server response");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Login error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)",
        p: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 440,
          width: "100%",
          borderRadius: 3,
          boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.25)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 4,
            textAlign: "center",
            backgroundColor: "primary.main",
            color: "white",
          }}
        >
          <Box
            component="img"
            src={brandImg}
            alt="RubriCheck"
            sx={{ height: 48, mb: 2 }}
          />
          <Typography variant="h5" fontWeight={700}>
            Welcome to RubriCheck
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
            Your AI-powered grading assistant
          </Typography>
        </Box>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h6" fontWeight={600} gutterBottom>
            Sign in to your account
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Enter your credentials to access your dashboard
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoComplete="email"
              autoFocus
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              autoComplete="current-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      aria-label="toggle password visibility"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, py: 1.5, fontWeight: 600 }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
