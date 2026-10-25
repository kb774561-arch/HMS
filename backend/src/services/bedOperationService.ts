import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { todayIst, toDateOnly } from "../utils/dates.js";
import { toNumber } from "../utils/money.js";
import { naturalCompare } from "./roomService.js";

type Tx = Prisma.TransactionClient;
const DAY = 86_400_000;

/*
 * Effective-date convention: the new allocation starts ON the effective date and the
 * previous one ends the day BEFORE it, so a student never holds two beds on one day.
 * An allocation that would end before it started (moved on its own start day) is
 * closed as CANCELLED — it never took effect.
 */

/** Other people's claims on a bed covering `date`: overlapping allocations (current or historical) and reservations. */
async function bedConflicts(tx: Tx | typeof prisma, bedId: string, date: Date, ignoreTenantIds: string[]) {
  const [allocation, reservation] = await Promise.all([
    tx.bedAllocation.findFirst({
      where: {
        bedId,
        tenantId: { notIn: ignoreTenantIds },
        status: { not: "CANCELLED" },
        startDate: { lte: date },
        OR: [{ endDate: null }, { endDate: { gte: date } }],
      },
      include: { tenant: { select: { tenantName: true } } },
    }),
    tx.bedReservation.findFirst({
      where: {
        bedId,
        OR: [{ tenantId: null }, { tenantId: { notIn: ignoreTenantIds } }],
        fromDate: { lte: date },
        AND: [{ OR: [{ toDate: null }, { toDate: { gte: date } }] }],
      },
      include: { tenant: { select: { tenantName: true } } },
    }),
  ]);
  if (allocation) return `occupied by ${allocation.tenant.tenantName} on that date`;
  if (reservation) return `reserved${reservation.tenant ? ` for ${reservation.tenant.tenantName}` : ""} on that date`;
  return null;
}

function effectiveDate(value: string) {
  const date = toDateOnly(value);
  if (date > todayIst()) throw new ValidationError({ effectiveDate: "The effective date can't be in the future" });
  return date;
}

/** Lock the active allocation of each student (consistent id order) and return them. */
async function lockActiveAllocations(tx: Tx, tenantIds: string[]) {
  const sorted = [...tenantIds].sort();
  await tx.$queryRaw`
    SELECT id FROM genius_pg.bed_allocations
    WHERE tenant_id IN (${Prisma.join(sorted)}) AND status = 'ACTIVE'
    ORDER BY id FOR UPDATE`;
  const allocations = await tx.bedAllocation.findMany({
    where: { tenantId: { in: sorted }, status: "ACTIVE" },
    include: { tenant: true, bed: { include: { room: true } } },
  });
  return new Map(allocations.map((a) => [a.tenantId, a]));
}

async function lockBeds(tx: Tx, bedIds: string[]) {
  await tx.$queryRaw`SELECT id FROM genius_pg.beds WHERE id IN (${Prisma.join([...new Set(bedIds)].sort())}) ORDER BY id FOR UPDATE`;
}

/** Close the current allocation at the boundary and open the new one. */
async function moveAllocation(
  tx: Tx,
  current: { id: string; startDate: Date },
  date: Date,
) {
  const dayBefore = new Date(date.getTime() - DAY);
  await tx.bedAllocation.update({
    where: { id: current.id },
    data: dayBefore < current.startDate ? { status: "CANCELLED", endDate: current.startDate } : { status: "TRANSFERRED", endDate: dayBefore },
  });
}

async function changeRent(tx: Tx, tenantId: string, oldRent: number, newRent: number | undefined, date: Date, reason: string) {
  if (newRent === undefined || newRent === oldRent) return oldRent;
  await tx.tenantRentHistory.updateMany({ where: { tenantId, effectiveTo: null }, data: { effectiveTo: date } });
  await tx.tenantRentHistory.create({ data: { tenantId, monthlyRent: newRent, effectiveFrom: date, reason } });
  return newRent;
}

function bedTaken(err: unknown): never {
  // Partial unique index bed_allocations_one_active_per_bed: a concurrent request won the bed.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new ValidationError({ toBedId: "That bed was just taken by another operation. Pick another bed." });
  }
  throw err;
}

export const bedOperationService = {
  /** Beds free on `date`: active, unblocked, in an active room, and not claimed by anyone else. */
  async available(dateStr: string | undefined, excludeTenantId?: string) {
    const date = dateStr ? toDateOnly(dateStr) : todayIst();
    const ignore = excludeTenantId ? [excludeTenantId] : [];
    const beds = await prisma.bed.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        isBlocked: false,
        room: { isActive: true, deletedAt: null },
        // Nobody else occupies it now…
        allocations: { none: { status: "ACTIVE", tenantId: { notIn: ignore } } },
      },
      include: {
        room: true,
        // …and nobody else held or reserved it on the effective date.
        allocations: {
          where: {
            tenantId: { notIn: ignore },
            status: { not: "CANCELLED" },
            startDate: { lte: date },
            OR: [{ endDate: null }, { endDate: { gte: date } }],
          },
          select: { id: true },
        },
        reservations: {
          where: { fromDate: { lte: date }, OR: [{ toDate: null }, { toDate: { gte: date } }] },
          select: { id: true, tenantId: true },
        },
      },
    });
    return beds
      .filter((b) => !b.allocations.length && !b.reservations.some((r) => !r.tenantId || !ignore.includes(r.tenantId)))
      .map((b) => ({
        id: b.id,
        bedCode: b.bedCode,
        roomId: b.roomId,
        roomNumber: b.room.roomNumber,
        floor: b.room.floor,
        defaultRent: toNumber(b.defaultRent) || toNumber(b.room.defaultMonthlyRent),
      }))
      .sort((a, b) => naturalCompare(a.roomNumber, b.roomNumber) || naturalCompare(a.bedCode, b.bedCode));
  },

  /** Type 1 — move one student to an empty bed. The old bed becomes available. */
  async transfer(
    input: { tenantId: string; toBedId: string; effectiveDate: string; newMonthlyRent?: number; reason?: string | null; notes?: string | null },
    actorId?: string,
  ) {
    const date = effectiveDate(input.effectiveDate);

    const historyId = await prisma
      .$transaction(
        async (tx) => {
          const current = (await lockActiveAllocations(tx, [input.tenantId])).get(input.tenantId);
          if (!current) throw new ValidationError({ tenantId: "This student has no bed. Use Allocate bed instead." });
          if (current.bedId === input.toBedId) throw new ValidationError({ toBedId: "Choose a different bed from the current one" });
          if (date < current.startDate) {
            throw new ValidationError({ effectiveDate: `Must be on or after the current bed's start date` });
          }

          await lockBeds(tx, [current.bedId, input.toBedId]);
          const target = await tx.bed.findFirst({ where: { id: input.toBedId, deletedAt: null }, include: { room: true } });
          if (!target) throw new ValidationError({ toBedId: "Selected bed no longer exists" });
          if (!target.isActive || target.isBlocked || !target.room.isActive) throw new ValidationError({ toBedId: "This bed is blocked or inactive" });
          const conflict = await bedConflicts(tx, target.id, date, [input.tenantId]);
          if (conflict) throw new ValidationError({ toBedId: `${target.room.roomNumber} / ${target.bedCode} is ${conflict}` });

          const oldRent = toNumber(current.monthlyRent);
          await moveAllocation(tx, current, date);
          const rent = await changeRent(tx, input.tenantId, oldRent, input.newMonthlyRent, date, "Rent changed on bed transfer");
          await tx.bedAllocation.create({
            data: {
              tenantId: input.tenantId,
              roomId: target.roomId,
              bedId: target.id,
              startDate: date,
              status: "ACTIVE",
              monthlyRent: rent,
              reason: input.reason ?? "Transfer",
              notes: input.notes ?? undefined,
              createdById: actorId,
            },
          });
          await tx.tenant.update({ where: { id: input.tenantId }, data: { roomId: target.roomId, bedId: target.id, monthlyRent: rent } });

          const history = await tx.bedTransferHistory.create({
            data: {
              operationType: "TRANSFER",
              studentAId: input.tenantId,
              fromBedAId: current.bedId,
              toBedAId: target.id,
              effectiveDate: date,
              reason: input.reason ?? null,
              notes: input.notes ?? null,
              performedById: actorId,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: "BED_TRANSFER",
              entityType: "bed_transfer_history",
              entityId: history.id,
              metadata: { tenantId: input.tenantId, fromBedId: current.bedId, toBedId: target.id, oldRent, newRent: rent },
            },
          });
          return history.id;
        },
        { timeout: 20_000, isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
      )
      .catch(bedTaken);

    return this.operation(historyId);
  },

  /**
   * Type 2 — exchange the beds of two students atomically. Both old allocations are
   * closed before either new one opens, so the one-active-per-bed index never trips.
   */
  async swap(
    input: {
      tenantAId: string;
      tenantBId: string;
      effectiveDate: string;
      newMonthlyRentA?: number;
      newMonthlyRentB?: number;
      reason?: string | null;
      notes?: string | null;
    },
    actorId?: string,
  ) {
    if (input.tenantAId === input.tenantBId) throw new ValidationError({ tenantBId: "Choose two different students" });
    const date = effectiveDate(input.effectiveDate);

    const historyId = await prisma
      .$transaction(
        async (tx) => {
          const active = await lockActiveAllocations(tx, [input.tenantAId, input.tenantBId]);
          const a = active.get(input.tenantAId);
          const b = active.get(input.tenantBId);
          if (!a) throw new ValidationError({ tenantAId: "Student A has no active bed" });
          if (!b) throw new ValidationError({ tenantBId: "Student B has no active bed" });
          if (a.bedId === b.bedId) throw new ValidationError({ tenantBId: "Both students are on the same bed" });
          for (const alloc of [a, b]) {
            if (date < alloc.startDate) {
              throw new ValidationError({ effectiveDate: `${alloc.tenant.tenantName}'s current bed starts after this date` });
            }
          }

          await lockBeds(tx, [a.bedId, b.bedId]);
          const pair = [input.tenantAId, input.tenantBId];
          for (const [alloc, label] of [[b, a.tenant.tenantName], [a, b.tenant.tenantName]] as const) {
            const conflict = await bedConflicts(tx, alloc.bedId, date, pair);
            if (conflict) {
              throw new ValidationError({ effectiveDate: `${alloc.bed.room.roomNumber} / ${alloc.bed.bedCode} (for ${label}) is ${conflict}` });
            }
          }

          const oldRentA = toNumber(a.monthlyRent);
          const oldRentB = toNumber(b.monthlyRent);
          await moveAllocation(tx, a, date);
          await moveAllocation(tx, b, date);
          const rentA = await changeRent(tx, a.tenantId, oldRentA, input.newMonthlyRentA, date, "Rent changed on bed swap");
          const rentB = await changeRent(tx, b.tenantId, oldRentB, input.newMonthlyRentB, date, "Rent changed on bed swap");

          for (const [student, bed, rent] of [[a, b.bed, rentA], [b, a.bed, rentB]] as const) {
            await tx.bedAllocation.create({
              data: {
                tenantId: student.tenantId,
                roomId: bed.roomId,
                bedId: bed.id,
                startDate: date,
                status: "ACTIVE",
                monthlyRent: rent,
                reason: input.reason ?? "Bed swap",
                notes: input.notes ?? undefined,
                createdById: actorId,
              },
            });
            await tx.tenant.update({ where: { id: student.tenantId }, data: { roomId: bed.roomId, bedId: bed.id, monthlyRent: rent } });
          }

          const history = await tx.bedTransferHistory.create({
            data: {
              operationType: "SWAP",
              studentAId: a.tenantId,
              studentBId: b.tenantId,
              fromBedAId: a.bedId,
              toBedAId: b.bedId,
              fromBedBId: b.bedId,
              toBedBId: a.bedId,
              effectiveDate: date,
              reason: input.reason ?? null,
              notes: input.notes ?? null,
              performedById: actorId,
            },
          });
          await tx.auditLog.create({
            data: {
              actorId,
              action: "BED_SWAP",
              entityType: "bed_transfer_history",
              entityId: history.id,
              metadata: { tenantAId: a.tenantId, tenantBId: b.tenantId, bedA: a.bedId, bedB: b.bedId, rentA: [oldRentA, rentA], rentB: [oldRentB, rentB] },
            },
          });
          return history.id;
        },
        { timeout: 20_000 },
      )
      .catch(bedTaken);

    return this.operation(historyId);
  },

  async operation(id: string) {
    const op = await prisma.bedTransferHistory.findUnique({
      where: { id },
      include: {
        studentA: { select: { tenantName: true } },
        studentB: { select: { tenantName: true } },
        fromBedA: { include: { room: true } },
        toBedA: { include: { room: true } },
        fromBedB: { include: { room: true } },
        toBedB: { include: { room: true } },
      },
    });
    if (!op) throw new NotFoundError("Operation not found");
    const loc = (b: { bedCode: string; room: { roomNumber: string } } | null) => (b ? `${b.room.roomNumber} / ${b.bedCode}` : null);
    return {
      id: op.id,
      operationType: op.operationType,
      effectiveDate: op.effectiveDate,
      studentA: { name: op.studentA.tenantName, from: loc(op.fromBedA), to: loc(op.toBedA) },
      studentB: op.studentB ? { name: op.studentB.tenantName, from: loc(op.fromBedB), to: loc(op.toBedB) } : null,
    };
  },

  /** A student's bed operations from their own point of view (as Student A or B). */
  async history(tenantId: string) {
    const ops = await prisma.bedTransferHistory.findMany({
      where: { OR: [{ studentAId: tenantId }, { studentBId: tenantId }] },
      include: {
        studentA: { select: { id: true, tenantName: true } },
        studentB: { select: { id: true, tenantName: true } },
        fromBedA: { include: { room: true } },
        toBedA: { include: { room: true } },
        fromBedB: { include: { room: true } },
        toBedB: { include: { room: true } },
        performedBy: { select: { fullName: true } },
      },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    });
    return ops.map((op) => {
      const isA = op.studentAId === tenantId;
      const from = isA ? op.fromBedA : op.fromBedB!;
      const to = isA ? op.toBedA : op.toBedB!;
      const other = isA ? op.studentB : op.studentA;
      return {
        id: op.id,
        date: op.effectiveDate,
        operationType: op.operationType,
        previousRoom: from.room.roomNumber,
        previousBed: from.bedCode,
        newRoom: to.room.roomNumber,
        newBed: to.bedCode,
        otherStudent: op.operationType === "SWAP" && other ? other.tenantName : null,
        reason: op.reason,
        notes: op.notes,
        performedBy: op.performedBy?.fullName ?? null,
        recordedAt: op.createdAt,
      };
    });
  },
};
