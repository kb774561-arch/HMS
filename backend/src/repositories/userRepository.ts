import { prisma } from "../config/database.js";

export const userRepository = {
  findByUsername(username: string) {
    return prisma.user.findFirst({
      where: { username, deletedAt: null },
      include: { role: true },
    });
  },

  findById(id: string) {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { role: true },
    });
  },

  list() {
    return prisma.user.findMany({
      where: { deletedAt: null },
      include: { role: true },
      orderBy: { username: "asc" },
    });
  },

  updatePassword(id: string, passwordHash: string) {
    return prisma.user.update({
      where: { id },
      data: { passwordHash, mustChangePassword: false },
    });
  },

  touchLastLogin(id: string) {
    return prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  },
};
