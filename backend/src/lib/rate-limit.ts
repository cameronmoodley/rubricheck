// eslint-disable-next-line @typescript-eslint/no-require-imports
const rateLimit = require("express-rate-limit") as typeof import("express-rate-limit").default;

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100,
  message: { message: "Too many uploads. Try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120,
  message: { message: "Too many requests. Slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});
