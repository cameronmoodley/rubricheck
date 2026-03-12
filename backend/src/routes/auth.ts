import express, { Request, Response } from "express";
import {
  register,
  login,
  validateRegister,
  validateLogin,
  authenticateToken,
  checkRole,
} from "../auth/auth";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const router = express.Router();
const prisma = new PrismaClient();

// Register endpoint
router.post("/register", validateRegister, register);

// Login endpoint
router.post("/login", validateLogin, login);

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
