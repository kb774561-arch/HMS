import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function isDatabaseUnavailable(err: unknown) {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return ["P1000", "P1001", "P1002", "P1008", "P1017", "P2024"].includes(err.code);
  }
  return err instanceof Prisma.PrismaClientRustPanicError;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  if (err instanceof ZodError) {
    return res.status(422).json({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Please correct the highlighted fields",
      details: { fieldErrors: zodFieldErrors(err) },
    });
  }

  // Database connectivity problems are a 503 — never a 401 — so the UI keeps the session.
  if (isDatabaseUnavailable(err)) {
    logger.error("Database unavailable", { path: req.path, error: (err as Error).message });
    return res.status(503).json({
      success: false,
      code: "DATABASE_UNAVAILABLE",
      message: "Database is temporarily unreachable. Your data was not saved — please retry.",
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return res.status(409).json({
        success: false,
        code: "DUPLICATE",
        message: "A record with the same value already exists",
        details: { target: err.meta?.target },
      });
    }
    if (err.code === "P2025") {
      return res.status(404).json({ success: false, code: "NOT_FOUND", message: "Record not found" });
    }
    if (err.code === "P2003") {
      return res.status(409).json({
        success: false,
        code: "IN_USE",
        message: "This record is referenced by other data and cannot be changed",
      });
    }
  }

  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ success: false, code: "BAD_JSON", message: "Malformed request body" });
  }

  logger.error("Unhandled error", {
    path: req.path,
    error: err instanceof Error ? err.message : "unknown",
  });

  return res.status(500).json({
    success: false,
    code: "INTERNAL_ERROR",
    message: "Something went wrong on the server. Your input has been kept — please try again.",
  });
}
