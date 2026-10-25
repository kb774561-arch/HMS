import { createHash } from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export type JwtPayload = {
  sub: string;
  username: string;
  role: string;
  exp?: number;
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}

export function tokenExpiry(token: string): Date {
  const decoded = jwt.decode(token) as JwtPayload | null;
  return decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 12 * 3600_000);
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
