import { prisma } from "../config/database.js";
import { AppError, NotFoundError, ValidationError } from "../utils/errors.js";
import { toNumber } from "../utils/money.js";
import { naturalCompare } from "./roomService.js";

export const bedService = {
  async list(params: { roomId?: string; status?: string } = {}) {
    const beds = await prisma.bed.findMany({
      where: { deletedAt: null, ...(params.roomId ? { roomId: params.roomId } : {}) },
      include: {
        room: true,
        allocations: { where: { status: "ACTIVE" }, include: { tenant: true }, take: 1 },
      },
    });

    const rows = beds
      .map((b) => {
        const alloc = b.allocations[0];
        const status = !b.isActive ? "INACTIVE" : b.isBlocked ? "BLOCKED" : alloc ? "OCCUPIED" : "AVAILABLE";
        return {
          id: b.id,
          roomId: b.roomId,
          roomNumber: b.room.roomNumber,
          roomActive: b.room.isActive,
          bedCode: b.bedCode,
          bedType: b.bedType,
          defaultRent: toNumber(b.defaultRent) || toNumber(b.room.defaultMonthlyRent),
          isActive: b.isActive,
          isBlocked: b.isBlocked,
          status,
          tenant: alloc
            ? { id: alloc.tenant.id, tenantName: alloc.tenant.tenantName, monthlyRent: toNumber(alloc.monthlyRent) }
            : null,
        };
      })
      .sort((a, b) => naturalCompare(a.roomNumber, b.roomNumber) || naturalCompare(a.bedCode, b.bedCode));

    return params.status ? rows.filter((r) => r.status === params.status && r.roomActive) : rows;
  },

  async availability() {
    const beds = await this.list();
    const by = (s: string) => beds.filter((b) => b.status === s);
    return {
      available: by("AVAILABLE"),
      occupied: by("OCCUPIED"),
      blocked: by("BLOCKED"),
      totals: {
        total: beds.filter((b) => b.status !== "INACTIVE").length,
        available: by("AVAILABLE").length,
        occupied: by("OCCUPIED").length,
        blocked: by("BLOCKED").length,
      },
    };
  },

  async update(
    id: string,
    data: Partial<{ bedCode: string; bedType: string | null; defaultRent: number; isActive: boolean; isBlocked: boolean }>,
  ) {
    const bed = await prisma.bed.findFirst({ where: { id, deletedAt: null } });
    if (!bed) throw new NotFoundError("Bed not found");

    if (data.isBlocked === true || data.isActive === false) {
      const active = await prisma.bedAllocation.findFirst({ where: { bedId: id, status: "ACTIVE" } });
      if (active) throw new AppError("This bed is occupied. Move or deactivate the tenant first.", 409, "BED_OCCUPIED");
    }
    if (data.bedCode && data.bedCode !== bed.bedCode) {
      const dup = await prisma.bed.findFirst({ where: { roomId: bed.roomId, bedCode: data.bedCode, NOT: { id } } });
      if (dup) throw new ValidationError({ bedCode: "Bed code already exists in this room" });
    }
    return prisma.bed.update({ where: { id }, data });
  },
};
