import type { PermissionAction } from "@prisma/client";
import { prisma } from "../config/database.js";
import { menuRepository } from "../repositories/menuRepository.js";
import { permissionRepository } from "../repositories/permissionRepository.js";
import { userRepository } from "../repositories/userRepository.js";

export const ALL_ACTIONS: PermissionAction[] = ["VIEW", "ADD", "EDIT", "DELETE", "EXPORT", "PRINT", "APPROVE"];

type Principal = { id: string; roleId: string; roleName: string };

export const permissionService = {
  /** True when the user holds `action` on any of the given menu routes (role grant, then user override). */
  async hasAny(user: Principal, menuRoutes: string[], action: PermissionAction) {
    if (user.roleName === "SUPER_ADMIN") return true;

    const menus = await prisma.menu.findMany({
      where: { routePath: { in: menuRoutes }, isActive: true },
      select: {
        rolePermissions: { where: { roleId: user.roleId, action }, select: { allowed: true } },
        userOverrides: { where: { userId: user.id, action }, select: { allowed: true } },
      },
    });

    return menus.some((m) => {
      const override = m.userOverrides[0];
      if (override) return override.allowed;
      return m.rolePermissions[0]?.allowed ?? false;
    });
  },

  async userHasPermission(userId: string, menuRoute: string, action: PermissionAction) {
    const user = await userRepository.findById(userId);
    if (!user) return false;
    return this.hasAny({ id: user.id, roleId: user.roleId, roleName: user.role.roleName }, [menuRoute], action);
  },

  /** routePath → allowed actions, for the client to show/hide controls. */
  async effectivePermissions(user: Principal): Promise<Record<string, PermissionAction[]>> {
    const menus = await menuRepository.listActive();
    const result: Record<string, PermissionAction[]> = {};

    if (user.roleName === "SUPER_ADMIN") {
      for (const m of menus) if (m.routePath) result[m.routePath] = [...ALL_ACTIONS];
      return result;
    }

    const [rolePerms, overrides] = await Promise.all([
      permissionRepository.rolePermissions(user.roleId),
      permissionRepository.userOverrides(user.id),
    ]);
    const allowed = new Set(rolePerms.filter((p) => p.allowed).map((p) => `${p.menuId}:${p.action}`));
    for (const o of overrides) {
      const key = `${o.menuId}:${o.action}`;
      if (o.allowed) allowed.add(key);
      else allowed.delete(key);
    }

    for (const m of menus) {
      if (!m.routePath) continue;
      const actions = ALL_ACTIONS.filter((a) => allowed.has(`${m.id}:${a}`));
      if (actions.length) result[m.routePath] = actions;
    }
    return result;
  },

  async getEffectiveViewMenuIds(userId: string): Promise<Set<string>> {
    const user = await userRepository.findById(userId);
    if (!user) return new Set();

    const menus = await menuRepository.listActive();
    if (user.role.roleName === "SUPER_ADMIN") return new Set(menus.map((m) => m.id));

    const perms = await this.effectivePermissions({
      id: user.id,
      roleId: user.roleId,
      roleName: user.role.roleName,
    });
    return new Set(menus.filter((m) => m.routePath && perms[m.routePath]?.includes("VIEW")).map((m) => m.id));
  },
};
