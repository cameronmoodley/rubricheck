import { UserRole } from "@prisma/client";

export interface AuthUser {
  userId: string;
  email: string;
  role: UserRole;
}

// Extend Express Request
declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}
