import React, { useState, useEffect } from "react";
import "../dark-theme.css";

type ThemeProviderProps = {
  children: React.ReactNode;
};

const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [isDarkMode] = useState(false); // Set initial state to dark mode (no setter needed for now)

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add("pf-v6-theme-dark");
    } else {
      document.documentElement.classList.remove("pf-v6-theme-dark");
    }
  }, [isDarkMode]);

  return <>{children}</>;
};

export default ThemeProvider;
