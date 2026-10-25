import "dotenv/config";
import { PrismaClient, PermissionAction } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ACTIONS: PermissionAction[] = [
  "VIEW",
  "ADD",
  "EDIT",
  "DELETE",
  "EXPORT",
  "PRINT",
  "APPROVE",
];

type MenuDef = {
  key: string;
  menuName: string;
  routePath?: string;
  icon?: string;
  displayOrder: number;
  adminOnly?: boolean;
  children?: MenuDef[];
};

/** One menu item per business module — CRUD lives inside each screen */
const MENU_TREE: MenuDef[] = [
  { key: "dashboard", menuName: "Dashboard", routePath: "/dashboard", icon: "LayoutDashboard", displayOrder: 10 },
  { key: "tenants", menuName: "Tenants", routePath: "/tenants", icon: "Users", displayOrder: 20 },
  { key: "rooms", menuName: "Rooms & Beds", routePath: "/rooms", icon: "BedDouble", displayOrder: 30 },
  { key: "rent", menuName: "Monthly Rent", routePath: "/rent", icon: "Receipt", displayOrder: 40 },
  { key: "payments", menuName: "Payments", routePath: "/payments", icon: "Wallet", displayOrder: 50 },
  { key: "deposits", menuName: "Deposits", routePath: "/deposits", icon: "Shield", displayOrder: 60 },
  { key: "settings", menuName: "Settings", routePath: "/settings", icon: "Settings", displayOrder: 100 },
];

const ROOM_CAPACITIES = [7, 4, 5, 2, 5, 5, 3, 5, 6, 2, 5, 5];

async function upsertMenuTree(
  defs: MenuDef[],
  parentId: string | null,
  registry: Map<string, { id: string; adminOnly?: boolean }>,
) {
  for (const def of defs) {
    const existing = await prisma.menu.findFirst({
      where: {
        menuName: def.menuName,
        parentMenuId: parentId,
        routePath: def.routePath ?? null,
      },
    });

    const menu =
      existing ??
      (await prisma.menu.create({
        data: {
          menuName: def.menuName,
          parentMenuId: parentId,
          routePath: def.routePath,
          icon: def.icon,
          displayOrder: def.displayOrder,
          isActive: true,
        },
      }));

    if (existing) {
      await prisma.menu.update({
        where: { id: existing.id },
        data: {
          icon: def.icon,
          displayOrder: def.displayOrder,
          routePath: def.routePath,
          isActive: true,
        },
      });
    }

    registry.set(def.key, { id: menu.id, adminOnly: def.adminOnly });
    if (def.children?.length) {
      await upsertMenuTree(def.children, menu.id, registry);
    }
  }
}

async function grantAll(roleId: string, menuId: string) {
  for (const action of ACTIONS) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_menuId_action: { roleId, menuId, action },
      },
      create: { roleId, menuId, action, allowed: true },
      update: { allowed: true },
    });
  }
}

async function main() {
  console.log("Seeding Genius Girls PG (genius_pg)...");

  const superRole = await prisma.role.upsert({
    where: { roleName: "SUPER_ADMIN" },
    create: {
      roleName: "SUPER_ADMIN",
      description: "Full system access",
      isActive: true,
    },
    update: { isActive: true },
  });

  const operatorRole = await prisma.role.upsert({
    where: { roleName: "PG_OPERATOR" },
    create: {
      roleName: "PG_OPERATOR",
      description: "Day-to-day PG operations",
      isActive: true,
    },
    update: { isActive: true },
  });

  const adminHash = await bcrypt.hash("Admin@123", 12);
  const opHash = await bcrypt.hash("om@123", 12);

  await prisma.user.upsert({
    where: { username: "superadmin" },
    create: {
      username: "superadmin",
      fullName: "Super Admin",
      roleId: superRole.id,
      passwordHash: adminHash,
      mustChangePassword: true,
      isActive: true,
    },
    update: {
      roleId: superRole.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { username: "ommaster" },
    create: {
      username: "ommaster",
      fullName: "Om Master",
      roleId: operatorRole.id,
      passwordHash: opHash,
      mustChangePassword: true,
      isActive: true,
    },
    update: {
      roleId: operatorRole.id,
      isActive: true,
    },
  });

  const menuRegistry = new Map<string, { id: string; adminOnly?: boolean }>();
  await upsertMenuTree(MENU_TREE, null, menuRegistry);

  const allMenus = await prisma.menu.findMany();
  for (const menu of allMenus) {
    await grantAll(superRole.id, menu.id);
  }

  const adminOnlyIds = new Set(
    [...menuRegistry.values()].filter((m) => m.adminOnly).map((m) => m.id),
  );
  // Also mark parent Administration as admin-only
  const adminParent = menuRegistry.get("admin");
  if (adminParent) adminOnlyIds.add(adminParent.id);

  for (const menu of allMenus) {
    if (adminOnlyIds.has(menu.id)) continue;
    await grantAll(operatorRole.id, menu.id);
  }

  for (const name of ["Ankit", "Om", "Genius PG"]) {
    await prisma.collectionAccount.upsert({
      where: { accountName: name },
      create: { accountName: name, accountType: "Receiving", isActive: true },
      update: { isActive: true },
    });
  }

  for (const name of [
    "Electricity",
    "Laundry",
    "Food",
    "Maintenance",
    "Damage",
    "Late Fee",
    "Other",
  ]) {
    await prisma.chargeType.upsert({
      where: { name },
      create: { name, isActive: true },
      update: { isActive: true },
    });
  }

  let pg = await prisma.pgProperty.findFirst({ where: { name: "Genius Girls PG" } });
  if (!pg) {
    pg = await prisma.pgProperty.create({
      data: { name: "Genius Girls PG", isActive: true },
    });
  }

  for (let i = 0; i < ROOM_CAPACITIES.length; i++) {
    const roomNumber = `Room ${i + 1}`;
    const capacity = ROOM_CAPACITIES[i];
    let room = await prisma.room.findFirst({
      where: { pgPropertyId: pg.id, roomNumber },
    });
    if (!room) {
      room = await prisma.room.create({
        data: {
          pgPropertyId: pg.id,
          roomNumber,
          capacity,
          floor: i < 6 ? "1" : "2",
          isActive: true,
        },
      });
    } else {
      room = await prisma.room.update({
        where: { id: room.id },
        data: { capacity, isActive: true },
      });
    }

    for (let b = 1; b <= capacity; b++) {
      const bedCode = `B${b}`;
      const existing = await prisma.bed.findFirst({
        where: { roomId: room.id, bedCode },
      });
      if (!existing) {
        await prisma.bed.create({
          data: { roomId: room.id, bedCode, isActive: true },
        });
      }
    }
  }

  const settings: Record<string, string> = {
    APP_TIMEZONE: "Asia/Kolkata",
    CURRENCY: "INR",
    CURRENCY_SYMBOL: "₹",
    RECEIPT_PREFIX: "GGP-",
    PRODUCT_NAME: "Genius Girls PG",
    PROVIDER_NAME: "Karmatechlab",
    PROVIDER_URL: "https://karmatechlab.com/",
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  const bedCount = await prisma.bed.count();
  console.log(`Seed complete. Beds: ${bedCount}. Users: superadmin, ommaster.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
