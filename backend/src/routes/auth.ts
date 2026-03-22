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
router.get("/validate", authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ isValid: false });
    }
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!dbUser) {
      return res.status(401).json({ isValid: false });
    }
    res.json({
      isValid: true,
      user: {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
        role: dbUser.role,
      },
    });
  } catch {
    res.status(500).json({ isValid: false });
  }
});

export default router;
