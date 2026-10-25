import { Router } from "express";
import rateLimitImport from "express-rate-limit";
import { authController } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { changePasswordSchema, loginSchema } from "../validators/authValidators.js";
import { cjsDefault } from "../utils/interop.js";

const rateLimit = cjsDefault(rateLimitImport);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, code: "RATE_LIMITED", message: "Too many sign-in attempts. Try again in a few minutes." },
});

export const authRoutes = Router();

authRoutes.post("/login", loginLimiter, validateBody(loginSchema), authController.login);
authRoutes.post("/refresh", authenticate, authController.refresh);
authRoutes.get("/me", authenticate, authController.me);
authRoutes.post("/change-password", authenticate, validateBody(changePasswordSchema), authController.changePassword);
authRoutes.post("/logout", authenticate, authController.logout);
