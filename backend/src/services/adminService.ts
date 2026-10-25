import { PermissionAction } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError, NotFoundError, ValidationError } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import { ALL_ACTIONS } from "./permissionService.js";

export const adminService = {
  listMenus() {
    return prisma.menu.findMany({
      where: { parentMenuId: null, routePath: { not: null } },
      orderBy: [{ isActive: "desc" }, { displayOrder: "asc" }, { menuName: "asc" }],
    });
  },

  async updateMenu(
    id: string,
    data: Partial<{ menuName: string; icon: string | null; displayOrder: number; isActive: boolean }>,
  ) {
    const menu = await prisma.menu.findUnique({ where: { id } });
    if (!menu) throw new NotFoundError("Menu not found");
    if (data.isActive === false && menu.routePath === "/settings") {
      throw new AppError("Settings cannot be disabled — it is needed to manage menus", 409);
    }
    return prisma.menu.update({ where: { id }, data });
  },

  async listRoles() {
    const roles = await prisma.role.findMany({
      orderBy: { roleName: "asc" },
      include: { _count: { select: { users: { where: { deletedAt: null } } } } },
    });
    return roles.map((r) => ({
      id: r.id,
      roleName: r.roleName,
      description: r.description,
      isActive: r.isActive,
      userCount: r._count.users,
      isSystem: r.roleName === "SUPER_ADMIN",
    }));
  },

  async createRole(roleName: string, description?: string | null) {
    const dup = await prisma.role.findUnique({ where: { roleName } });
    if (dup) throw new ValidationError({ roleName: "A role with this name already exists" });
    return prisma.role.create({ data: { roleName, description } });
  },

  async updateRole(id: string, data: { description?: string | null; isActive?: boolean }) {
    const role = await prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundError("Role not found");
    if (role.roleName === "SUPER_ADMIN" && data.isActive === false) {
      throw new AppError("The Super Admin role cannot be deactivated", 409);
    }
    return prisma.role.update({ where: { id }, data });
  },

  async listUsers() {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: { username: "asc" },
    });
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      roleId: u.roleId,
      role: u.role.roleName,
      isActive: u.isActive,
      mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
    }));
  },

  async createUser(data: { username: string; fullName: string; roleId: string; password: string }) {
    const exists = await prisma.user.findUnique({ where: { username: data.username } });
    if (exists) throw new ValidationError({ username: "This username is already taken" });
    const role = await prisma.role.findUnique({ where: { id: data.roleId } });
    if (!role) throw new ValidationError({ roleId: "Select a valid role" });
    const user = await prisma.user.create({
      data: {
        username: data.username,
        fullName: data.fullName,
        roleId: data.roleId,
        passwordHash: await hashPassword(data.password),
        mustChangePassword: true,
      },
    });
    return { id: user.id, username: user.username };
  },

  async updateUser(
    id: string,
    data: Partial<{ fullName: string; roleId: string; isActive: boolean; password: string }>,
    actorId?: string,
  ) {
    const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, include: { role: true } });
    if (!user) throw new NotFoundError("User not found");

    const losingAdmin =
      user.role.roleName === "SUPER_ADMIN" &&
      (data.isActive === false || (data.roleId && data.roleId !== user.roleId));
    if (losingAdmin) {
      if (id === actorId) throw new AppError("You cannot deactivate or demote your own account", 409);
      const admins = await prisma.user.count({
        where: { isActive: true, deletedAt: null, role: { roleName: "SUPER_ADMIN" } },
      });
      if (admins <= 1) throw new AppError("At least one active Super Admin is required", 409);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        fullName: data.fullName,
        roleId: data.roleId,
        isActive: data.isActive,
        ...(data.password ? { passwordHash: await hashPassword(data.password), mustChangePassword: true } : {}),
      },
    });

    // Deactivation or a password reset ends the user's existing sessions.
    if (data.isActive === false || data.password) {
      await prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    }
    return { id: updated.id };
  },

  async getRolePermissions(roleId: string) {
    const [menus, perms] = await Promise.all([
      prisma.menu.findMany({
        where: { isActive: true, parentMenuId: null, routePath: { not: null } },
        orderBy: { displayOrder: "asc" },
      }),
      prisma.rolePermission.findMany({ where: { roleId } }),
    ]);
    const map = new Map(perms.map((p) => [`${p.menuId}:${p.action}`, p.allowed]));
    return menus.map((m) => ({
      menuId: m.id,
      menuName: m.menuName,
      routePath: m.routePath,
      actions: Object.fromEntries(ALL_ACTIONS.map((a) => [a, map.get(`${m.id}:${a}`) ?? false])),
    }));
  },

  async setRolePermission(roleId: string, menuId: string, action: PermissionAction, allowed: boolean) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (role?.roleName === "SUPER_ADMIN") throw new AppError("Super Admin always has full access", 409);
    return prisma.rolePermission.upsert({
      where: { roleId_menuId_action: { roleId, menuId, action } },
      create: { roleId, menuId, action, allowed },
      update: { allowed },
    });
  },

  async getUserOverrides(userId: string) {
    const rows = await prisma.userPermissionOverride.findMany({ where: { userId }, include: { menu: true } });
    return rows.map((o) => ({ id: o.id, menuId: o.menuId, menuName: o.menu.menuName, action: o.action, allowed: o.allowed }));
  },

  /** `allowed: null` removes the override so the user falls back to the role grant. */
  async setUserOverride(userId: string, menuId: string, action: PermissionAction, allowed: boolean | null) {
    if (allowed === null) {
      await prisma.userPermissionOverride.deleteMany({ where: { userId, menuId, action } });
      return { removed: true };
    }
    return prisma.userPermissionOverride.upsert({
      where: { userId_menuId_action: { userId, menuId, action } },
      create: { userId, menuId, action, allowed },
      update: { allowed },
    });
  },

  listSettings() {
    return prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  },

  upsertSetting(key: string, value: string) {
    return prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  },

  async auditLogs(limit = 100) {
    const rows = await prisma.auditLog.findMany({
      include: { actor: { select: { fullName: true, username: true } } },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 500),
    });
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.actor?.fullName ?? "System",
      createdAt: r.createdAt,
    }));
  },

  async pgProperty() {
    return (
      (await prisma.pgProperty.findFirst({ where: { isActive: true } })) ??
      prisma.pgProperty.create({ data: { name: "Genius Girls PG" } })
    );
  },

  async updatePg(id: string, data: { name?: string; address?: string | null; phone?: string | null }) {
    const existing = await prisma.pgProperty.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("PG not found");
    return prisma.pgProperty.update({ where: { id }, data });
  },
};
