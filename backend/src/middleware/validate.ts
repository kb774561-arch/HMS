import type { NextFunction, Request, Response } from "express";
import type { ZodType } from "zod";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body ?? {});
    if (!parsed.success) return next(parsed.error);
    req.body = parsed.data;
    next();
  };
}
