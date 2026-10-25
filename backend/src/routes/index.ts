import { Router } from "express";
import { authRoutes } from "./authRoutes.js";
import { authenticate } from "../middleware/auth.js";
import { menuController } from "../controllers/menuController.js";
import { healthController } from "../controllers/healthController.js";
import { domainRoutes } from "./domainRoutes.js";

export const apiRouter = Router();

apiRouter.get("/health", healthController.check);
apiRouter.use("/auth", authRoutes);
apiRouter.get("/navigation/my-menus", authenticate, menuController.myMenus);
apiRouter.use(domainRoutes);

apiRouter.use((_req, res) => {
  res.status(404).json({ success: false, code: "NOT_FOUND", message: "API route not found" });
});
