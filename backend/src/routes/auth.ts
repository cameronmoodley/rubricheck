import express, { Request, Response } from "express";
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  validateRegister,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  authenticateToken,
  checkRole,
} from "../auth/auth";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { authRateLimiter } from "../lib/rate-limit";

const router = express.Router();
const prisma = new PrismaClient();

// Register endpoint (rate limited)
router.post("/register", authRateLimiter, validateRegister, register);

// Login endpoint (rate limited)
router.post("/login", authRateLimiter, validateLogin, login);

// Forgot password (rate limited)
router.post("/forgot-password", authRateLimiter, validateForgotPassword, forgotPassword);

// Reset password
router.post("/reset-password", authRateLimiter, validateResetPassword, resetPassword);

// Validate token endpoint
router.get("/validate", authenticateToken, (req, res) => {
  // If we get here, the token is valid (authenticateToken middleware passed)
  res.json({
    isValid: true,
    user: {
      id: req.user?.userId,
      email: req.user?.email,
      role: req.user?.role,
    },
  });
});

export default router;
