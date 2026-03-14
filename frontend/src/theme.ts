import { createTheme } from "@mui/material/styles";

// RubriCheck Brand Colors - March 2026
const colors = {
  electricBlue: "#0066CC",
  vibrantCyan: "#00B4D8",
  deepNavy: "#1A1A2E",
  successGreen: "#00D084",
  warningOrange: "#FF9500",
  alertRed: "#FF4444",
  neutralGray: "#F0F0F0",
};

const theme = createTheme({
  palette: {
    primary: {
      main: colors.electricBlue,
      light: "#3399FF",
      dark: "#004C99",
    },
    secondary: {
      main: colors.vibrantCyan,
      light: "#48CAE4",
      dark: "#0096C7",
    },
    success: {
      main: colors.successGreen,
    },
    warning: {
      main: colors.warningOrange,
    },
    error: {
      main: colors.alertRed,
    },
    text: {
      primary: colors.deepNavy,
      secondary: "rgba(26, 26, 46, 0.7)",
    },
    background: {
      default: colors.neutralGray,
      paper: "#FFFFFF",
    },
  },
  typography: {
    fontFamily: '"Inter", "Poppins", "Segoe UI", "Roboto", "Helvetica", "Arial", sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: "2.5rem", // 40pt
      color: colors.deepNavy,
    },
    h2: {
      fontWeight: 600,
      fontSize: "1.75rem", // 28pt
      color: colors.deepNavy,
    },
    h3: {
      fontWeight: 600,
      fontSize: "1.25rem", // 20pt
      color: colors.deepNavy,
    },
    h4: {
      fontWeight: 600,
      fontSize: "1.125rem", // 18pt
      color: colors.deepNavy,
    },
    h5: {
      fontWeight: 600,
      fontSize: "1rem",
      color: colors.deepNavy,
    },
    h6: {
      fontWeight: 600,
      fontSize: "0.875rem",
      color: colors.deepNavy,
    },
    body1: {
      fontSize: "1rem", // 16pt
      fontWeight: 400,
    },
    body2: {
      fontSize: "0.875rem", // 14pt
      fontWeight: 400,
    },
    caption: {
      fontSize: "0.8125rem", // 13pt
      fontWeight: 400,
    },
  },
  shape: {
    borderRadius: 8, // 8px base unit
  },
  spacing: 8, // 8px base unit
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 8,
          fontWeight: 600,
        },
        contained: {
          "&:hover": {
            backgroundColor: "#004C99",
          },
        },
        outlined: {
          "&:hover": {
            borderColor: colors.vibrantCyan,
            backgroundColor: "rgba(0, 180, 216, 0.08)",
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.08)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          boxShadow: "0 1px 3px 0 rgb(0 0 0 / 0.08)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: "background.paper",
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: "rgba(0, 0, 0, 0.12)",
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.vibrantCyan,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: colors.electricBlue,
            borderWidth: 2,
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
            color: colors.deepNavy,
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
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
            backgroundColor: "rgba(0, 102, 204, 0.08)",
            "&:hover": {
              backgroundColor: "rgba(0, 102, 204, 0.12)",
            },
          },
        },
      },
    },
  },
});

export default theme;
