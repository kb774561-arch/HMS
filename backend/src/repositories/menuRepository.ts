import { prisma } from "../config/database.js";

export const menuRepository = {
  listActive() {
    return prisma.menu.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: "asc" }, { menuName: "asc" }],
    });
  },

  listAll() {
    return prisma.menu.findMany({
      orderBy: [{ displayOrder: "asc" }, { menuName: "asc" }],
    });
  },

  findByRoute(routePath: string) {
    return prisma.menu.findFirst({ where: { routePath } });
  },
};
