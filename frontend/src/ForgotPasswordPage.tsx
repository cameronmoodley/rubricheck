import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
} from "@mui/material";
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email) {
      setError("Please enter your email.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = (await res.json().catch(() => ({}))) as { message?: string };

      if (!res.ok) {
        setError(data?.message || "Something went wrong");
        return;
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
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
            Reset password
          </Typography>
          <Typography variant="body2" sx={{ mt: 1, opacity: 0.9 }}>
            Enter your email to receive a reset link
          </Typography>
        </Box>
        <CardContent sx={{ p: 4 }}>
          {success ? (
            <>
              <Alert severity="success" sx={{ mb: 2 }}>
                If an account exists with that email, you will receive a password reset link shortly.
              </Alert>
              <Button component={Link} to="/login" fullWidth variant="contained">
                Back to sign in
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
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                margin="normal"
                required
                autoComplete="email"
                autoFocus
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3, py: 1.5, fontWeight: 600 }}
              >
                {loading ? "Sending..." : "Send reset link"}
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
