import { prisma } from "../config/database.js";
import { env } from "../config/env.js";
import { userRepository } from "../repositories/userRepository.js";
import { AppError, UnauthorizedError } from "../utils/errors.js";
import { hashToken, signToken, tokenExpiry } from "../utils/jwt.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { permissionService } from "./permissionService.js";

type UserWithRole = NonNullable<Awaited<ReturnType<typeof userRepository.findById>>>;

async function issueSession(user: UserWithRole) {
  const token = signToken({ sub: user.id, username: user.username, role: user.role.roleName });
  const expiresAt = tokenExpiry(token);
  await prisma.session.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt },
  });
  return { token, expiresAt };
}

async function publicUser(user: UserWithRole) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role.roleName,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    permissions: await permissionService.effectivePermissions({
      id: user.id,
      roleId: user.roleId,
      roleName: user.role.roleName,
    }),
  };
}

export const authService = {
  async login(username: string, password: string) {
    const user = await userRepository.findByUsername(username.trim());
    if (!user || !user.isActive || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedError("Invalid username or password", "INVALID_CREDENTIALS");
    }

    const { token, expiresAt } = await issueSession(user);
    await userRepository.touchLastLogin(user.id);
    await prisma.auditLog.create({
      data: { actorId: user.id, action: "LOGIN", entityType: "user", entityId: user.id },
    });

    return { token, expiresAt, expiresIn: env.JWT_EXPIRES_IN, user: await publicUser(user) };
  },

  /** Sliding refresh: exchange a still-valid token for a fresh one and revoke the old session. */
  async refresh(userId: string, oldToken: string) {
    const user = await userRepository.findById(userId);
    if (!user || !user.isActive) throw new UnauthorizedError("Your account is inactive", "ACCOUNT_INACTIVE");

    const { token, expiresAt } = await issueSession(user);
    await prisma.session.updateMany({
      where: { userId, tokenHash: hashToken(oldToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { token, expiresAt, user: await publicUser(user) };
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new UnauthorizedError();

    if (!(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new AppError("Current password is incorrect", 422, "VALIDATION_ERROR", {
        fieldErrors: { currentPassword: "Current password is incorrect" },
      });
    }

    await userRepository.updatePassword(userId, await hashPassword(newPassword));
    await prisma.auditLog.create({
      data: { actorId: userId, action: "CHANGE_PASSWORD", entityType: "user", entityId: userId },
    });
    return { success: true };
  },

  async me(userId: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new UnauthorizedError("Your account is inactive", "ACCOUNT_INACTIVE");
    return publicUser(user);
  },

  async logout(userId: string, token?: string) {
    if (token) {
      await prisma.session.updateMany({
        where: { userId, tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return { success: true };
  },
};
