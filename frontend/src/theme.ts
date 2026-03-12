import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    primary: {
      main: "#6366F1",
      light: "#818CF8",
      dark: "#4F46E5",
    },
    secondary: {
      main: "#0EA5E9",
      light: "#38BDF8",
      dark: "#0284C7",
    },
    success: {
      main: "#10B981",
    },
    warning: {
      main: "#F59E0B",
    },
    error: {
      main: "#EF4444",
    },
    background: {
      default: "#F8FAFC",
      paper: "#FFFFFF",
    },
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: "2rem",
    },
    h2: {
      fontWeight: 600,
      fontSize: "1.5rem",
    },
    h3: {
      fontWeight: 600,
      fontSize: "1.25rem",
    },
    h4: {
      fontWeight: 600,
      fontSize: "1.125rem",
    },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 10,
          fontWeight: 600,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          backgroundColor: "background.paper",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(0, 0, 0, 0.12)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(0, 0, 0, 0.24)",
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: "primary.main",
            borderWidth: 1.5,
          },
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        select: {
          paddingTop: 12,
          paddingBottom: 12,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        outlined: {
          "&.MuiInputLabel-shrink": {
            color: "text.secondary",
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 10,
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12)",
          marginTop: 4,
          maxHeight: 320,
        },
        list: {
          paddingTop: 8,
          paddingBottom: 8,
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          paddingTop: 10,
          paddingBottom: 10,
          "&.Mui-selected": {
            backgroundColor: "rgba(99, 102, 241, 0.08)",
            "&:hover": {
              backgroundColor: "rgba(99, 102, 241, 0.12)",
            },
          },
        },
      },
    },
  },
});

export default theme;
