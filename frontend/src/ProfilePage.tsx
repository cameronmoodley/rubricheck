import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Alert,
} from "@mui/material";
import { useAuth } from "./hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <Box>
        <Alert severity="warning">Not authenticated</Alert>
      </Box>
    );
  }

  const getRoleStyle = (role: string) => {
    switch (role) {
      case "ADMIN": return { bgcolor: "#FEE2E2", color: "#B91C1C" };
      case "TEACHER": return { bgcolor: "#DBEAFE", color: "#1D4ED8" };
      default: return { bgcolor: "#F3F4F6", color: "#4B5563" };
    }
  };

  return (
    <Box>
      <Typography variant="h4" fontWeight={700} gutterBottom>Profile</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        View your account details and manage your session
      </Typography>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, md: 8, lg: 6 }}>
          <Card>
            <CardContent>
              <Typography variant="h6" fontWeight={600} gutterBottom>
                Account Information
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">Name</Typography>
                  <Typography fontWeight={500}>{user.name}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Email</Typography>
                  <Typography fontWeight={500}>{user.email}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Role</Typography>
                  <Typography>
                    <Box
                      component="span"
                      sx={{
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 1,
                        fontWeight: 600,
                        fontSize: "0.875rem",
                        ...getRoleStyle(user.role),
                      }}
                    >
                      {user.role}
                    </Box>
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">User ID</Typography>
                  <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                    {user.id}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
                <Button variant="contained" color="error" onClick={logout} fullWidth>
                  Logout
                </Button>
                <Button variant="outlined" onClick={() => navigate(-1)} fullWidth>
                  Back
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
