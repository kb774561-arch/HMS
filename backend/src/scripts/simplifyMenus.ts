import "dotenv/config";
import { PrismaClient, PermissionAction } from "@prisma/client";

/**
 * One-off configuration: flat, one-screen-per-module navigation and the default
 * PG_OPERATOR grants. Business data is never touched. Re-running resets the
 * operator's grants on these menus to the defaults below.
 *
 *   npx tsx src/scripts/simplifyMenus.ts
 */
const prisma = new PrismaClient();

const ALL: PermissionAction[] = ["VIEW", "ADD", "EDIT", "DELETE", "EXPORT", "PRINT", "APPROVE"];
const OPERATOR_MODULE: PermissionAction[] = ["VIEW", "ADD", "EDIT", "EXPORT", "PRINT"];

const FLAT_MENUS: { menuName: string; routePath: string; icon: string; displayOrder: number; operator: PermissionAction[] }[] = [
  { menuName: "Dashboard", routePath: "/dashboard", icon: "LayoutDashboard", displayOrder: 10, operator: ["VIEW"] },
  { menuName: "Tenants", routePath: "/tenants", icon: "Users", displayOrder: 20, operator: OPERATOR_MODULE },
  { menuName: "Rooms & Beds", routePath: "/rooms", icon: "BedDouble", displayOrder: 30, operator: ["VIEW", "ADD", "EXPORT", "PRINT"] },
  { menuName: "Monthly Rent", routePath: "/rent", icon: "Receipt", displayOrder: 40, operator: OPERATOR_MODULE },
  { menuName: "Payments", routePath: "/payments", icon: "Wallet", displayOrder: 50, operator: OPERATOR_MODULE },
  { menuName: "Deposits", routePath: "/deposits", icon: "Shield", displayOrder: 60, operator: OPERATOR_MODULE },
  { menuName: "Expenditure", routePath: "/expenditure", icon: "HandCoins", displayOrder: 70, operator: OPERATOR_MODULE },
  { menuName: "Settings", routePath: "/settings", icon: "Settings", displayOrder: 100, operator: [] },
];

async function main() {
  const roles = await prisma.role.findMany();
  const keepIds: string[] = [];

  for (const m of FLAT_MENUS) {
    const existing =
      (await prisma.menu.findFirst({ where: { routePath: m.routePath, parentMenuId: null } })) ??
      (await prisma.menu.findFirst({ where: { menuName: m.menuName, parentMenuId: null } }));
    const data = { menuName: m.menuName, routePath: m.routePath, icon: m.icon, displayOrder: m.displayOrder, parentMenuId: null, isActive: true };
    const menu = existing
      ? await prisma.menu.update({ where: { id: existing.id }, data })
      : await prisma.menu.create({ data });
    keepIds.push(menu.id);

    for (const role of roles) {
      const granted = role.roleName === "SUPER_ADMIN" ? ALL : role.roleName === "PG_OPERATOR" ? m.operator : null;
      if (!granted) continue; // custom roles are managed from Settings → Permissions
      for (const action of ALL) {
        const allowed = granted.includes(action);
        await prisma.rolePermission.upsert({
          where: { roleId_menuId_action: { roleId: role.id, menuId: menu.id, action } },
          create: { roleId: role.id, menuId: menu.id, action, allowed },
          update: { allowed },
        });
      }
    }
  }

  const { count } = await prisma.menu.updateMany({ where: { id: { notIn: keepIds } }, data: { isActive: false } });
  console.log(`Flat menus active: ${keepIds.length}. Legacy submenus deactivated: ${count}. Operator defaults applied.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
