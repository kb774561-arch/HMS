import type { Request, Response, NextFunction } from "express";
import { menuService } from "../services/menuService.js";

export const menuController = {
  async myMenus(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await menuService.getMyMenus(req.user!.id);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },

  async listAll(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await menuService.listAll();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
};
