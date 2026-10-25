import { prisma } from "../config/database.js";
import { ValidationError } from "../utils/errors.js";
import { tenantService } from "./tenantService.js";

export const allocationService = {
  /** Rooms screen "Allocate bed": pick a bed, then a registered tenant without one. */
  async book(
    data: { tenantId: string; bedId: string; startDate: string; monthlyRent?: number; notes?: string | null },
    actorId?: string,
  ) {
    const bed = await prisma.bed.findFirst({ where: { id: data.bedId, deletedAt: null } });
    if (!bed) throw new ValidationError({ bedId: "Selected bed no longer exists" });
    return tenantService.allocate(
      data.tenantId,
      { roomId: bed.roomId, bedId: data.bedId, startDate: data.startDate, monthlyRent: data.monthlyRent, notes: data.notes },
      actorId,
    );
  },
};
