import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/database.js";
import { UnauthorizedError } from "../utils/errors.js";
import { hashToken, verifyToken } from "../utils/jwt.js";

export type AuthUser = {
  id: string;
  username: string;
  fullName: string;
  roleId: string;
  roleName: string;
  mustChangePassword: boolean;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      token?: string;
    }
  }
}

/**
 * Only token problems produce 401 (with a TOKEN_* / SESSION_* code). Database or
 * other runtime failures propagate to the error handler as 5xx so the client never
 * mistakes an outage for an expired session.
 */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new UnauthorizedError("Please sign in to continue", "TOKEN_MISSING"));
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    const expired = err instanceof jwt.TokenExpiredError;
    return next(
      new UnauthorizedError(
        expired ? "Your session has expired. Please sign in again." : "Invalid session token",
        expired ? "TOKEN_EXPIRED" : "TOKEN_INVALID",
      ),
    );
  }

  try {
    const [user, session] = await Promise.all([
      prisma.user.findFirst({
        where: { id: payload.sub, isActive: true, deletedAt: null },
        include: { role: true },
      }),
      prisma.session.findFirst({
        where: { userId: payload.sub, tokenHash: hashToken(token) },
        select: { revokedAt: true },
      }),
    ]);

    if (!user || !user.role.isActive) {
      return next(new UnauthorizedError("Your account is inactive", "ACCOUNT_INACTIVE"));
    }
    if (session?.revokedAt) {
      return next(new UnauthorizedError("You have been signed out", "SESSION_REVOKED"));
    }

    req.token = token;
    req.user = {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleId: user.roleId,
      roleName: user.role.roleName,
      mustChangePassword: user.mustChangePassword,
    };
    next();
  } catch (err) {
    next(err);
  }
}
