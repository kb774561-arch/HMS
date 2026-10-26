import { Router, type RequestHandler } from "express";
import rateLimitImport from "express-rate-limit";
import { authController } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { changePasswordSchema, loginSchema } from "../validators/authValidators.js";
import { cjsDefault } from "../utils/interop.js";

const rateLimit = cjsDefault(rateLimitImport);

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 30;
const RATE_LIMIT_BODY = {
  success: false,
  code: "RATE_LIMITED",
  message: "Too many sign-in attempts. Try again in a few minutes.",
} as const;

/**
 * express-rate-limit's MemoryStore uses timers at construction time, which Cloudflare
 * Workers forbid in the global scope. On Workers we use a tiny Map-based limiter instead;
 * Node/Vercel keep the existing express-rate-limit middleware.
 */
const loginRateLimit: RequestHandler =
  process.env.CF_WORKER === "1"
    ? createWorkerLoginLimiter()
    : rateLimit({
        windowMs: WINDOW_MS,
        max: MAX_ATTEMPTS,
        standardHeaders: true,
        legacyHeaders: false,
        message: RATE_LIMIT_BODY,
      });

function createWorkerLoginLimiter(): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return (req, res, next) => {
    const forwarded = req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"];
    const key = String(Array.isArray(forwarded) ? forwarded[0] : forwarded || "unknown");
    const now = Date.now();
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return next();
    }

    if (current.count >= MAX_ATTEMPTS) {
      res.status(429).json(RATE_LIMIT_BODY);
      return;
    }

    current.count += 1;
    return next();
  };
}

export const authRoutes = Router();

authRoutes.post("/login", loginRateLimit, validateBody(loginSchema), authController.login);
authRoutes.post("/refresh", authenticate, authController.refresh);
authRoutes.get("/me", authenticate, authController.me);
authRoutes.post("/change-password", authenticate, validateBody(changePasswordSchema), authController.changePassword);
authRoutes.post("/logout", authenticate, authController.logout);
