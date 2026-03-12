// Use an import type via `import()` to avoid making this file a regular module
// while still referencing the Prisma UserRole type. This pattern ensures this
// declaration is treated as an ambient augmentation for Express.Request.

type UserRole = import("@prisma/client").UserRole;

// Augment the Request interface from express-serve-static-core (used by @types/express v5)
declare module "express-serve-static-core" {
  interface Request {
    user?: {
      userId: string;
      email: string;
      role: UserRole;
    };
  }
}

export {};
