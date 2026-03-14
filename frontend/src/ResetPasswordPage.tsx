import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!tokenFromUrl) {
      setError("Invalid reset link. Please request a new one.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenFromUrl, password }),
      });

      const data = (await res.json().catch(() => ({}))) as { message?: string };

      if (!res.ok) {
        setError(data?.message || "Reset failed");
        return;
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  if (!tokenFromUrl) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0066CC 0%, #00B4D8 100%)",
          p: 2,
        }}
      >
        <Card sx={{ maxWidth: 440, width: "100%", p: 4 }}>
          <Alert severity="error" sx={{ mb: 2 }}>
            Invalid or missing reset token. Please use the link from your email or{" "}
            <Link to="/forgot-password">request a new one</Link>.
          </Alert>
          <Button component={Link} to="/login" fullWidth variant="contained">
            Back to sign in
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #0066CC 0%, #00B4D8 100%)",
        p: 2,
      }}
    >
      <Card
        sx={{
          maxWidth: 440,
          width: "100%",
          borderRadius: 2,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.08)",
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
          <Typography variant="h5" fontWeight={700}>
            Set new password
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
            Enter your new password below
          </Typography>
        </Box>
        <CardContent sx={{ p: 4 }}>
          {success ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                Your password has been reset. You can now sign in.
              </Alert>
              <Button component={Link} to="/login" fullWidth variant="contained">
                Sign in
              </Button>
            </>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <TextField
                fullWidth
                label="New password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                required
                autoComplete="new-password"
                autoFocus
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
              <TextField
                fullWidth
                label="Confirm password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                margin="normal"
                required
                autoComplete="new-password"
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3, py: 1.5, fontWeight: 600 }}
              >
                {loading ? "Resetting..." : "Reset password"}
              </Button>
            </Box>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: "center" }}>
            <Link to="/login" style={{ color: "inherit", textDecoration: "underline" }}>
              Back to sign in
            </Link>
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
