import type { Request, Response, NextFunction } from "express";
import { authService } from "../services/authService.js";

export const authController = {
  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { username, password } = req.body as { username: string; password: string };
      res.json({ success: true, data: await authService.login(username, password) });
    } catch (err) {
      next(err);
    }
  },

  async refresh(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await authService.refresh(req.user!.id, req.token!) });
    } catch (err) {
      next(err);
    }
  },

  async me(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await authService.me(req.user!.id) });
    } catch (err) {
      next(err);
    }
  },

  async changePassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
      res.json({ success: true, data: await authService.changePassword(req.user!.id, currentPassword, newPassword) });
    } catch (err) {
      next(err);
    }
  },

  async logout(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await authService.logout(req.user!.id, req.token) });
    } catch (err) {
      next(err);
    }
  },
};
