import type { Request, Response, NextFunction } from "express";
import { prisma } from "../config/database.js";

export const healthController = {
  async check(_req: Request, res: Response, next: NextFunction) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const schemaCheck = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (
          SELECT 1 FROM information_schema.schemata WHERE schema_name = 'genius_pg'
        ) AS exists`,
      );

      res.json({
        success: true,
        data: {
          status: "ok",
          service: "Genius Girls PG API",
          provider: "Karmatechlab",
          timezone: process.env.APP_TIMEZONE ?? "Asia/Kolkata",
          database: {
            connected: true,
            applicationSchemaReady: schemaCheck[0]?.exists ?? false,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
};
