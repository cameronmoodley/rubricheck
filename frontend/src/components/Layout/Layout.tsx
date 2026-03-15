import React, { useState } from "react";
import {
  Box,
  Drawer,
  AppBar,
  Toolbar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
} from "@mui/material";
import {
  Menu as MenuIcon,
  Dashboard as DashboardIcon,
  Upload as UploadIcon,
  Assignment as ResultsIcon,
  Class as ClassIcon,
  Subject as SubjectIcon,
  Quiz as QuizIcon,
  People as PeopleIcon,
  Person as PersonIcon,
  Settings as SettingsIcon,
  Logout as LogoutIcon,
  Folder as ExamProjectsIcon,
  Assessment as ExamResultsIcon,
  History as AuditIcon,
} from "@mui/icons-material";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { HIDE_MOODLE } from "../../config";

const DRAWER_WIDTH = 260;

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { path: "/", label: "Dashboard", icon: <DashboardIcon />, roles: ["ADMIN", "TEACHER"] },
  { path: "/my-grades", label: "My Grades", icon: <ExamResultsIcon />, roles: ["STUDENT"] },
  { path: "/upload", label: "AI Grading", icon: <UploadIcon />, roles: ["ADMIN", "TEACHER"] },
  { path: "/results", label: "Results", icon: <ResultsIcon />, roles: ["ADMIN", "TEACHER"] },
  { path: "/classes", label: "Classes", icon: <ClassIcon />, roles: ["ADMIN"] },
  { path: "/subjects", label: "Subjects", icon: <SubjectIcon />, roles: ["ADMIN"] },
  { path: "/rubric-templates", label: "Rubric Templates", icon: <ExamResultsIcon />, roles: ["ADMIN"] },
  ...(!HIDE_MOODLE ? [{ path: "/quiz", label: "Quiz", icon: <QuizIcon />, roles: ["ADMIN"] }] : []),
  { path: "/users", label: "Users", icon: <PeopleIcon />, roles: ["ADMIN"] },
  { path: "/audit", label: "Audit Log", icon: <AuditIcon />, roles: ["ADMIN"] },
  { path: "/exam-projects", label: "Exam Projects", icon: <ExamProjectsIcon />, roles: ["ADMIN", "TEACHER"] },
  { path: "/exam-project-results", label: "Exam Results", icon: <ExamResultsIcon />, roles: ["ADMIN", "TEACHER"] },
  { path: "/profile", label: "Profile", icon: <PersonIcon />, roles: ["ADMIN", "TEACHER"] },
];

export function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleUserMenuOpen = (e: React.MouseEvent<HTMLElement>) => setAnchorEl(e.currentTarget);
  const handleUserMenuClose = () => setAnchorEl(null);

  const handleProfileClick = () => {
    navigate("/profile");
    handleUserMenuClose();
  };

  const handleLogout = () => {
    logout();
    handleUserMenuClose();
  };

  const filteredNavItems = navItems.filter(
    (item) => user?.role && item.roles.includes(user.role)
  );

  const drawer = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          p: 2.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="h6" fontWeight={700} color="primary.main">
          RubriCheck
        </Typography>
      </Box>

      <List sx={{ flex: 1, px: 1, py: 2 }}>
        {filteredNavItems.map((item) => (
          <ListItemButton
            key={item.path}
            component={Link}
            to={item.path}
            selected={location.pathname === item.path}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              "&.Mui-selected": {
                backgroundColor: "primary.main",
                color: "white",
                "&:hover": { backgroundColor: "primary.dark" },
                "& .MuiListItemIcon-root": { color: "white" },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 500 }} />
          </ListItemButton>
        ))}
      </List>

      {user && (
        <>
          <Divider />
          <Box sx={{ p: 2 }}>
            <Box
              onClick={handleUserMenuOpen}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                p: 1.5,
                borderRadius: 2,
                cursor: "pointer",
                "&:hover": { backgroundColor: "action.hover" },
              }}
            >
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: 2,
                  bgcolor: "primary.main",
                  color: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 600,
                  fontSize: "1rem",
                }}
              >
                {(user.name || user.email || "U")[0].toUpperCase()}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={600} noWrap>
                  {user.name || user.email || "User"}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {user.role}
                </Typography>
              </Box>
              <SettingsIcon sx={{ fontSize: 20, color: "text.secondary" }} />
            </Box>
          </Box>
        </>
      )}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        sx={{
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { md: `${DRAWER_WIDTH}px` },
          backgroundColor: "background.paper",
          color: "text.primary",
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1)",
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { md: "none" } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1, fontWeight: 600 }}>
            RubriCheck
          </Typography>
        </Toolbar>
      </AppBar>

      <Box
        component="nav"
        sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: "block", md: "none" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
              borderRight: "none",
              boxShadow: "4px 0 24px 0 rgb(0 0 0 / 0.08)",
            },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: "none", md: "block" },
            "& .MuiDrawer-paper": {
              boxSizing: "border-box",
              width: DRAWER_WIDTH,
              borderRight: "none",
              boxShadow: "4px 0 24px 0 rgb(0 0 0 / 0.08)",
              top: 0,
              left: 0,
              height: "100vh",
            },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleUserMenuClose}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        transformOrigin={{ vertical: "bottom", horizontal: "right" }}
        PaperProps={{ sx: { mt: 1.5, minWidth: 200 } }}
      >
        <MenuItem onClick={handleProfileClick}>
          <ListItemIcon sx={{ minWidth: 36 }}><PersonIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Profile" />
        </MenuItem>
        <Divider />
        <MenuItem onClick={handleLogout} sx={{ color: "error.main" }}>
          <ListItemIcon sx={{ minWidth: 36 }}><LogoutIcon fontSize="small" /></ListItemIcon>
          <ListItemText primary="Logout" />
        </MenuItem>
      </Menu>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          mt: 8,
          backgroundColor: "background.default",
          minHeight: "100vh",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

export default Layout;
