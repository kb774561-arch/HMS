import { prisma } from "../config/database.js";
import { AppError, NotFoundError, ValidationError } from "../utils/errors.js";
import { toNumber } from "../utils/money.js";

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
export const naturalCompare = (a: string, b: string) => collator.compare(a, b);

type BedStatus = "AVAILABLE" | "OCCUPIED" | "BLOCKED" | "INACTIVE";

export const roomService = {
  async list() {
    const rooms = await prisma.room.findMany({
      where: { deletedAt: null },
      include: {
        beds: {
          where: { deletedAt: null },
          include: {
            allocations: {
              where: { status: "ACTIVE" },
              include: { tenant: { select: { id: true, tenantName: true, whatsappNumber: true } } },
              take: 1,
            },
          },
        },
      },
    });

    return rooms
      .map((r) => {
        const beds = r.beds
          .map((b) => {
            const alloc = b.allocations[0];
            const status: BedStatus = !b.isActive
              ? "INACTIVE"
              : b.isBlocked
                ? "BLOCKED"
                : alloc
                  ? "OCCUPIED"
                  : "AVAILABLE";
            return {
              id: b.id,
              bedCode: b.bedCode,
              bedType: b.bedType,
              defaultRent: toNumber(b.defaultRent),
              isActive: b.isActive,
              isBlocked: b.isBlocked,
              status,
              tenant: alloc
                ? {
                    id: alloc.tenant.id,
                    tenantName: alloc.tenant.tenantName,
                    monthlyRent: toNumber(alloc.monthlyRent),
                    since: alloc.startDate,
                  }
                : null,
            };
          })
          .sort((a, b) => naturalCompare(a.bedCode, b.bedCode));

        const usable = beds.filter((b) => b.status !== "INACTIVE");
        const occupied = beds.filter((b) => b.status === "OCCUPIED").length;
        const available = beds.filter((b) => b.status === "AVAILABLE").length;
        const blocked = beds.filter((b) => b.status === "BLOCKED").length;
        const totalBeds = usable.length;

        return {
          id: r.id,
          roomNumber: r.roomNumber,
          floor: r.floor,
          capacity: r.capacity,
          defaultMonthlyRent: toNumber(r.defaultMonthlyRent),
          description: r.description,
          isActive: r.isActive,
          totalBeds,
          occupied,
          available,
          blocked,
          occupancyPercentage: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0,
          status: !r.isActive ? "INACTIVE" : available === 0 && totalBeds > 0 ? "FULL" : occupied === 0 ? "VACANT" : "AVAILABLE",
          beds,
        };
      })
      .sort((a, b) => naturalCompare(a.roomNumber, b.roomNumber));
  },

  async summary() {
    const rooms = await this.list();
    const totalBeds = rooms.reduce((s, r) => s + (r.isActive ? r.totalBeds : 0), 0);
    const occupied = rooms.reduce((s, r) => s + r.occupied, 0);
    return {
      rooms,
      totals: {
        rooms: rooms.length,
        activeRooms: rooms.filter((r) => r.isActive).length,
        totalBeds,
        occupied,
        available: rooms.reduce((s, r) => s + (r.isActive ? r.available : 0), 0),
        blocked: rooms.reduce((s, r) => s + r.blocked, 0),
        occupancyPercentage: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0,
      },
    };
  },

  async get(id: string) {
    const r = await prisma.room.findFirst({
      where: { id, deletedAt: null },
      include: { beds: { where: { deletedAt: null } } },
    });
    if (!r) throw new NotFoundError("Room not found");
    return r;
  },

  async create(data: {
    roomNumber: string;
    floor?: string | null;
    capacity: number;
    defaultMonthlyRent?: number;
    description?: string | null;
  }) {
    const pg = await prisma.pgProperty.findFirst({ where: { isActive: true } });
    if (!pg) throw new AppError("No active PG property. Configure it in Settings first.", 400);

    const existing = await prisma.room.findFirst({
      where: { pgPropertyId: pg.id, roomNumber: { equals: data.roomNumber, mode: "insensitive" } },
    });
    if (existing) throw new ValidationError({ roomNumber: "This room number already exists" });

    return prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          pgPropertyId: pg.id,
          roomNumber: data.roomNumber,
          floor: data.floor ?? null,
          capacity: data.capacity,
          defaultMonthlyRent: data.defaultMonthlyRent ?? 0,
          description: data.description ?? null,
        },
      });
      await tx.bed.createMany({
        data: Array.from({ length: data.capacity }, (_, i) => ({
          roomId: room.id,
          bedCode: `B${i + 1}`,
          defaultRent: data.defaultMonthlyRent ?? 0,
        })),
      });
      return room;
    });
  },

  /** Capacity changes add beds (B{n}) or retire free beds from the end; occupied beds are never removed. */
  async update(
    id: string,
    data: Partial<{
      roomNumber: string;
      floor: string | null;
      capacity: number;
      defaultMonthlyRent: number;
      description: string | null;
      isActive: boolean;
    }>,
  ) {
    const room = await this.get(id);

    if (data.roomNumber && data.roomNumber.toLowerCase() !== room.roomNumber.toLowerCase()) {
      const dup = await prisma.room.findFirst({
        where: {
          pgPropertyId: room.pgPropertyId,
          roomNumber: { equals: data.roomNumber, mode: "insensitive" },
          NOT: { id },
        },
      });
      if (dup) throw new ValidationError({ roomNumber: "This room number already exists" });
    }

    if (data.isActive === false) {
      const active = await prisma.bedAllocation.count({ where: { roomId: id, status: "ACTIVE" } });
      if (active) throw new AppError(`Room has ${active} occupied bed(s). Move tenants before deactivating.`, 409, "ROOM_OCCUPIED");
    }

    return prisma.$transaction(async (tx) => {
      if (data.capacity != null && data.capacity !== room.beds.length) {
        const beds = [...room.beds].sort((a, b) => naturalCompare(a.bedCode, b.bedCode));
        if (data.capacity > beds.length) {
          const used = new Set(
            (await tx.bed.findMany({ where: { roomId: id }, select: { bedCode: true } })).map((b) => b.bedCode),
          );
          const toCreate: string[] = [];
          for (let n = 1; toCreate.length < data.capacity - beds.length; n++) {
            if (!used.has(`B${n}`)) toCreate.push(`B${n}`);
          }
          await tx.bed.createMany({
            data: toCreate.map((bedCode) => ({
              roomId: id,
              bedCode,
              defaultRent: data.defaultMonthlyRent ?? toNumber(room.defaultMonthlyRent),
            })),
          });
        } else {
          const removeCount = beds.length - data.capacity;
          const occupiedIds = new Set(
            (await tx.bedAllocation.findMany({ where: { roomId: id, status: "ACTIVE" }, select: { bedId: true } })).map(
              (a) => a.bedId,
            ),
          );
          const free = beds.filter((b) => !occupiedIds.has(b.id)).reverse();
          if (free.length < removeCount) {
            throw new ValidationError({
              capacity: `Only ${free.length} bed(s) are free. Minimum capacity is ${beds.length - free.length}.`,
            });
          }
          await tx.bed.updateMany({
            where: { id: { in: free.slice(0, removeCount).map((b) => b.id) } },
            data: { deletedAt: new Date(), isActive: false },
          });
        }
      }

      return tx.room.update({ where: { id }, data });
    });
  },
};
