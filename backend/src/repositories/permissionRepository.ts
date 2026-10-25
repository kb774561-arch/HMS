import type { PermissionAction } from "@prisma/client";
import { prisma } from "../config/database.js";

export const permissionRepository = {
  rolePermissions(roleId: string) {
    return prisma.rolePermission.findMany({
      where: { roleId, allowed: true },
      include: { menu: true },
    });
  },

  userOverrides(userId: string) {
    return prisma.userPermissionOverride.findMany({
      where: { userId },
      include: { menu: true },
    });
  },

  async hasPermission(roleId: string, userId: string, menuId: string, action: PermissionAction) {
    const override = await prisma.userPermissionOverride.findUnique({
      where: { userId_menuId_action: { userId, menuId, action } },
    });
    if (override) return override.allowed;

    const rolePerm = await prisma.rolePermission.findUnique({
      where: { roleId_menuId_action: { roleId, menuId, action } },
    });
    return rolePerm?.allowed ?? false;
  },
};
