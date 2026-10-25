import { Prisma, TenantStatus } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import { toDateOnly } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";
import { buildWhatsAppLink } from "../utils/whatsapp.js";

type Tx = Prisma.TransactionClient;

type TenantRecord = Prisma.TenantGetPayload<{ include: { room: true; bed: true } }>;

const ACTIVE_STATUSES: TenantStatus[] = ["ACTIVE", "NOTICE"];

/**
 * Accommodation is derived from the tenant's current room/bed, which is only ever
 * set together with an ACTIVE bed allocation (same transaction).
 */
function accommodationOf(t: { status: TenantStatus; bedId: string | null }) {
  if (!ACTIVE_STATUSES.includes(t.status)) return "LEFT" as const;
  return t.bedId ? ("RESIDING" as const) : ("UNALLOCATED" as const);
}

function serializeTenant(t: TenantRecord) {
  return {
    id: t.id,
    tenantName: t.tenantName,
    mobileNumber: t.mobileNumber,
    whatsappNumber: t.whatsappNumber,
    whatsappLink: buildWhatsAppLink(t.whatsappNumber),
    parentName: t.parentName,
    parentNumber: t.parentNumber,
    email: t.email,
    address: t.address,
    emergencyContact: t.emergencyContact,
    roomId: t.roomId,
    bedId: t.bedId,
    roomNumber: t.room?.roomNumber ?? null,
    bedCode: t.bed?.bedCode ?? null,
    joiningDate: t.joiningDate,
    leavingDate: t.leavingDate,
    status: t.status,
    isActive: ACTIVE_STATUSES.includes(t.status),
    accommodation: accommodationOf(t),
    monthlyRent: toNumber(t.monthlyRent),
    securityDeposit: toNumber(t.securityDeposit),
    notes: t.notes,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export type TenantCreateInput = {
  tenantName: string;
  joiningDate: string;
  monthlyRent: number;
  roomId?: string | null;
  bedId?: string | null;
  whatsappNumber?: string | null;
  mobileNumber?: string | null;
  parentName?: string | null;
  parentNumber?: string | null;
  email?: string | null;
  address?: string | null;
  leavingDate?: string | null;
  securityDeposit?: number;
  notes?: string | null;
};

export type TenantUpdateInput = Partial<Omit<TenantCreateInput, "roomId" | "bedId">>;

const SORTS: Record<string, (dir: Prisma.SortOrder) => Prisma.TenantOrderByWithRelationInput[]> = {
  name: (dir) => [{ tenantName: dir }],
  room: (dir) => [{ room: { roomNumber: dir } }, { bed: { bedCode: dir } }],
  joiningDate: (dir) => [{ joiningDate: dir }],
  monthlyRent: (dir) => [{ monthlyRent: dir }],
  status: (dir) => [{ status: dir }, { tenantName: "asc" }],
  createdAt: (dir) => [{ createdAt: dir }],
};

/** Validates the bed inside the transaction and books it. The partial unique index
 *  `bed_allocations_one_active_per_bed` is the final guard against double booking. */
async function allocateBed(
  tx: Tx,
  args: {
    tenantId: string;
    roomId: string;
    bedId: string;
    startDate: Date;
    monthlyRent: number;
    notes?: string | null;
    reason?: string | null;
    actorId?: string;
  },
) {
  const bed = await tx.bed.findFirst({ where: { id: args.bedId, deletedAt: null }, include: { room: true } });
  if (!bed) throw new ValidationError({ bedId: "Selected bed no longer exists" });
  if (bed.roomId !== args.roomId) throw new ValidationError({ bedId: "This bed does not belong to the selected room" });
  if (!bed.isActive || bed.isBlocked) throw new ValidationError({ bedId: "This bed is blocked or inactive" });
  if (!bed.room.isActive) throw new ValidationError({ roomId: "This room is inactive" });

  const occupied = await tx.bedAllocation.findFirst({
    where: { bedId: args.bedId, status: "ACTIVE", NOT: { tenantId: args.tenantId } },
    include: { tenant: { select: { tenantName: true } } },
  });
  if (occupied) {
    throw new ValidationError({ bedId: `Bed is already occupied by ${occupied.tenant.tenantName}` });
  }

  return tx.bedAllocation.create({
    data: {
      tenantId: args.tenantId,
      roomId: args.roomId,
      bedId: args.bedId,
      startDate: args.startDate,
      status: "ACTIVE",
      monthlyRent: args.monthlyRent,
      notes: args.notes ?? undefined,
      reason: args.reason ?? undefined,
      createdById: args.actorId,
    },
  });
}

async function recordRentChange(tx: Tx, tenantId: string, rent: number, from: Date, reason: string) {
  await tx.tenantRentHistory.updateMany({ where: { tenantId, effectiveTo: null }, data: { effectiveTo: from } });
  await tx.tenantRentHistory.create({ data: { tenantId, monthlyRent: rent, effectiveFrom: from, reason } });
}

async function runBedTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(fn, { timeout: 20_000 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new ValidationError({ bedId: "This bed was just taken by another tenant. Choose a different bed." });
    }
    throw err;
  }
}

async function loadTenant(id: string) {
  const t = await prisma.tenant.findFirst({ where: { id, deletedAt: null } });
  if (!t) throw new NotFoundError("Tenant not found");
  return t;
}

export const tenantService = {
  async list(params: {
    search?: string;
    status?: string;
    accommodation?: string;
    roomId?: string;
    page?: number;
    pageSize?: number;
    sort?: string;
    dir?: string;
  }) {
    const page = Math.max(params.page ?? 1, 1);
    const pageSize = Math.min(Math.max(params.pageSize ?? 10, 1), 500);
    const dir: Prisma.SortOrder = params.dir === "desc" ? "desc" : "asc";
    const orderBy = (SORTS[params.sort ?? "name"] ?? SORTS.name!)(dir);

    const statusFilter: Prisma.TenantWhereInput =
      params.status === "ACTIVE"
        ? { status: { in: ACTIVE_STATUSES } }
        : params.status === "INACTIVE" || params.status === "VACATED"
          ? { status: { in: ["VACATED", "BLOCKED"] } }
          : params.status && params.status in TenantStatus
            ? { status: params.status as TenantStatus }
            : {};
    const accommodationFilter: Prisma.TenantWhereInput =
      params.accommodation === "RESIDING"
        ? { status: { in: ACTIVE_STATUSES }, bedId: { not: null } }
        : params.accommodation === "UNALLOCATED"
          ? { status: { in: ACTIVE_STATUSES }, bedId: null }
          : {};

    const search = params.search?.trim();
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      AND: [
        statusFilter,
        accommodationFilter,
        params.roomId ? { roomId: params.roomId } : {},
        search
          ? {
              OR: [
                { tenantName: { contains: search, mode: "insensitive" } },
                { whatsappNumber: { contains: search } },
                { mobileNumber: { contains: search } },
                { parentNumber: { contains: search } },
                { room: { roomNumber: { contains: search, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    };

    const [total, rows, counts] = await Promise.all([
      prisma.tenant.count({ where }),
      prisma.tenant.findMany({ where, include: { room: true, bed: true }, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.counts(),
    ]);

    const outstanding = rows.length
      ? await prisma.rentInvoice.groupBy({
          by: ["tenantId"],
          where: { tenantId: { in: rows.map((r) => r.id) }, status: { not: "VOIDED" }, pendingAmount: { gt: 0 } },
          _sum: { pendingAmount: true },
        })
      : [];
    const outstandingMap = new Map(outstanding.map((o) => [o.tenantId, toNumber(o._sum.pendingAmount)]));

    return {
      items: rows.map((t) => ({ ...serializeTenant(t), outstanding: roundMoney(outstandingMap.get(t.id) ?? 0) })),
      total,
      page,
      pageSize,
      totalPages: Math.max(Math.ceil(total / pageSize), 1),
      summary: counts,
    };
  },

  /** Registered = active stay (with or without a bed); residing = has a bed now; unallocated = registered without a bed. */
  async counts() {
    const [registered, residing, inactive, all] = await Promise.all([
      prisma.tenant.count({ where: { deletedAt: null, status: { in: ACTIVE_STATUSES } } }),
      prisma.tenant.count({ where: { deletedAt: null, status: { in: ACTIVE_STATUSES }, bedId: { not: null } } }),
      prisma.tenant.count({ where: { deletedAt: null, status: { in: ["VACATED", "BLOCKED"] } } }),
      prisma.tenant.count({ where: { deletedAt: null } }),
    ]);
    return { total: all, registered, residing, unallocated: registered - residing, inactive, active: registered };
  },

  async get(id: string) {
    const t = await prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: {
        room: true,
        bed: true,
        allocations: { orderBy: [{ startDate: "asc" }, { createdAt: "asc" }], include: { room: true, bed: true } },
        invoices: { where: { status: { not: "VOIDED" } }, orderBy: [{ billingYear: "desc" }, { billingMonth: "desc" }] },
        payments: {
          where: { status: "RECORDED" },
          orderBy: { paymentDate: "desc" },
          include: { collectionAccount: true, receipt: true },
          take: 50,
        },
        deposits: { orderBy: { txnDate: "desc" }, include: { collectionAccount: true } },
        additionalCharges: { orderBy: { chargeDate: "desc" }, include: { chargeType: true } },
        rentHistory: { orderBy: { effectiveFrom: "desc" } },
      },
    });
    if (!t) throw new NotFoundError("Tenant not found");

    const depositBalance = roundMoney(
      t.deposits.reduce((s, d) => (d.txnType === "COLLECTION" ? s + toNumber(d.amount) : s - toNumber(d.amount)), 0),
    );
    const outstanding = roundMoney(t.invoices.reduce((s, i) => s + toNumber(i.pendingAmount), 0));

    return {
      ...serializeTenant(t),
      outstanding,
      depositBalance,
      allocations: [...t.allocations].reverse().map((a) => ({
        id: a.id,
        roomNumber: a.room.roomNumber,
        bedCode: a.bed.bedCode,
        roomId: a.roomId,
        bedId: a.bedId,
        startDate: a.startDate,
        endDate: a.endDate,
        status: a.status,
        monthlyRent: toNumber(a.monthlyRent),
        reason: a.reason,
      })),
      invoices: t.invoices.map((i) => ({
        id: i.id,
        billingMonth: i.billingMonth,
        billingYear: i.billingYear,
        totalPayable: toNumber(i.totalPayable),
        paidAmount: toNumber(i.paidAmount),
        pendingAmount: toNumber(i.pendingAmount),
        status: i.status,
        source: i.source,
      })),
      payments: t.payments.map((p) => ({
        id: p.id,
        paymentDate: p.paymentDate,
        amountReceived: toNumber(p.amountReceived),
        paymentMethod: p.paymentMethod,
        account: p.collectionAccount.accountName,
        receiptNumber: p.receipt?.receiptNumber ?? null,
        unallocatedAmount: toNumber(p.unallocatedAmount),
      })),
      deposits: t.deposits.map((d) => ({
        id: d.id,
        txnType: d.txnType,
        txnDate: d.txnDate,
        amount: toNumber(d.amount),
        account: d.collectionAccount?.accountName ?? null,
        notes: d.notes,
      })),
      additionalCharges: t.additionalCharges.map((c) => ({
        id: c.id,
        chargeType: c.chargeType.name,
        chargeDate: c.chargeDate,
        amount: toNumber(c.amount),
        paidAmount: toNumber(c.paidAmount),
        pendingAmount: toNumber(c.pendingAmount),
        description: c.description,
      })),
      rentHistory: t.rentHistory.map((h) => ({
        id: h.id,
        monthlyRent: toNumber(h.monthlyRent),
        effectiveFrom: h.effectiveFrom,
        effectiveTo: h.effectiveTo,
        reason: h.reason,
      })),
    };
  },

  /** "Register only" when no room/bed is given; "Register and allocate bed" otherwise. */
  async create(input: TenantCreateInput, actorId?: string) {
    const joiningDate = toDateOnly(input.joiningDate);
    const withBed = Boolean(input.roomId && input.bedId);

    const created = await runBedTransaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          tenantName: input.tenantName,
          mobileNumber: input.mobileNumber ?? null,
          whatsappNumber: input.whatsappNumber ?? null,
          parentName: input.parentName ?? null,
          parentNumber: input.parentNumber ?? null,
          email: input.email ?? null,
          address: input.address ?? null,
          roomId: withBed ? input.roomId : null,
          bedId: withBed ? input.bedId : null,
          joiningDate,
          leavingDate: input.leavingDate ? toDateOnly(input.leavingDate) : null,
          monthlyRent: input.monthlyRent,
          securityDeposit: input.securityDeposit ?? 0,
          notes: input.notes ?? null,
          status: "ACTIVE",
        },
      });

      if (withBed) {
        await allocateBed(tx, {
          tenantId: tenant.id,
          roomId: input.roomId!,
          bedId: input.bedId!,
          startDate: joiningDate,
          monthlyRent: input.monthlyRent,
          reason: "Registration",
          actorId,
        });
      }

      await tx.tenantRentHistory.create({
        data: { tenantId: tenant.id, monthlyRent: input.monthlyRent, effectiveFrom: joiningDate, reason: "Initial registration" },
      });
      await tx.auditLog.create({
        data: { actorId, action: "TENANT_CREATE", entityType: "tenant", entityId: tenant.id, metadata: { withBed } },
      });
      return tenant;
    });

    return this.get(created.id);
  },

  async update(id: string, data: TenantUpdateInput, actorId?: string) {
    const existing = await loadTenant(id);
    const isActive = ACTIVE_STATUSES.includes(existing.status);
    const rentChanged = data.monthlyRent != null && data.monthlyRent !== toNumber(existing.monthlyRent);
    const today = toDateOnly(new Date());

    await prisma.$transaction(async (tx) => {
      if (rentChanged && isActive) {
        await tx.bedAllocation.updateMany({ where: { tenantId: id, status: "ACTIVE" }, data: { monthlyRent: data.monthlyRent } });
      }
      await tx.tenant.update({
        where: { id },
        data: {
          tenantName: data.tenantName,
          mobileNumber: data.mobileNumber,
          whatsappNumber: data.whatsappNumber,
          parentName: data.parentName,
          parentNumber: data.parentNumber,
          email: data.email,
          address: data.address,
          notes: data.notes,
          monthlyRent: data.monthlyRent,
          securityDeposit: data.securityDeposit,
          ...(data.joiningDate ? { joiningDate: toDateOnly(data.joiningDate) } : {}),
          ...(data.leavingDate !== undefined ? { leavingDate: data.leavingDate ? toDateOnly(data.leavingDate) : null } : {}),
        },
      });
      if (rentChanged) await recordRentChange(tx, id, data.monthlyRent!, today, "Rent updated");
      await tx.auditLog.create({
        data: { actorId, action: "TENANT_UPDATE", entityType: "tenant", entityId: id, metadata: { rentChanged } },
      });
    });

    return this.get(id);
  },

  /** Allocate Bed Later — for a registered tenant who has no bed yet. */
  async allocate(
    id: string,
    input: { roomId: string; bedId: string; startDate: string; monthlyRent?: number; notes?: string | null },
    actorId?: string,
  ) {
    const t = await loadTenant(id);
    if (!ACTIVE_STATUSES.includes(t.status)) {
      throw new ValidationError({ bedId: "This tenant is inactive — use Activate to give them a bed" });
    }
    const current = await prisma.bedAllocation.findFirst({ where: { tenantId: id, status: "ACTIVE" } });
    if (current || t.bedId) throw new ConflictError("Tenant already has a bed. Use Transfer to move them.");

    const start = toDateOnly(input.startDate);
    const rent = input.monthlyRent ?? toNumber(t.monthlyRent);

    await runBedTransaction(async (tx) => {
      await allocateBed(tx, { tenantId: id, roomId: input.roomId, bedId: input.bedId, startDate: start, monthlyRent: rent, notes: input.notes, reason: "Bed allocated", actorId });
      await tx.tenant.update({ where: { id }, data: { roomId: input.roomId, bedId: input.bedId, monthlyRent: rent } });
      if (rent !== toNumber(t.monthlyRent)) await recordRentChange(tx, id, rent, start, "Rent set on bed allocation");
      await tx.auditLog.create({
        data: { actorId, action: "BED_ALLOCATE", entityType: "tenant", entityId: id, metadata: { bedId: input.bedId } },
      });
    });
    return this.get(id);
  },

  /** Deactivate = tenant leaves: allocation closed, bed freed, history preserved. */
  async deactivate(id: string, leavingDate: string, notes: string | null | undefined, actorId?: string) {
    const t = await loadTenant(id);
    if (!ACTIVE_STATUSES.includes(t.status)) throw new AppError("Tenant is already inactive", 409, "ALREADY_INACTIVE");

    const leave = toDateOnly(leavingDate);
    if (leave < t.joiningDate) throw new ValidationError({ leavingDate: "Leaving date cannot be before joining date" });

    await prisma.$transaction(async (tx) => {
      await tx.bedAllocation.updateMany({ where: { tenantId: id, status: "ACTIVE" }, data: { status: "VACATED", endDate: leave } });
      await tx.tenant.update({
        where: { id },
        data: {
          status: "VACATED",
          leavingDate: leave,
          roomId: null,
          bedId: null,
          ...(notes ? { notes: [t.notes, `Left: ${notes}`].filter(Boolean).join("\n") } : {}),
        },
      });
      await tx.auditLog.create({ data: { actorId, action: "TENANT_DEACTIVATE", entityType: "tenant", entityId: id } });
    });
    return this.get(id);
  },

  /** Reactivate a tenant who left. A bed is optional — they can be allocated later. */
  async activate(
    id: string,
    input: { roomId?: string | null; bedId?: string | null; startDate: string; monthlyRent?: number },
    actorId?: string,
  ) {
    const t = await loadTenant(id);
    if (ACTIVE_STATUSES.includes(t.status)) throw new AppError("Tenant is already active", 409, "ALREADY_ACTIVE");

    const rent = input.monthlyRent ?? toNumber(t.monthlyRent);
    const start = toDateOnly(input.startDate);
    const withBed = Boolean(input.roomId && input.bedId);

    await runBedTransaction(async (tx) => {
      if (withBed) {
        await allocateBed(tx, { tenantId: id, roomId: input.roomId!, bedId: input.bedId!, startDate: start, monthlyRent: rent, reason: "Reactivated", actorId });
      }
      await tx.tenant.update({
        where: { id },
        data: { status: "ACTIVE", leavingDate: null, roomId: withBed ? input.roomId : null, bedId: withBed ? input.bedId : null, monthlyRent: rent },
      });
      if (rent !== toNumber(t.monthlyRent)) await recordRentChange(tx, id, rent, start, "Reactivated");
      await tx.auditLog.create({ data: { actorId, action: "TENANT_ACTIVATE", entityType: "tenant", entityId: id } });
    });
    return this.get(id);
  },

  /** Safe delete: hidden from lists, financial history kept for reports. */
  async archive(id: string, actorId?: string) {
    await loadTenant(id);
    const pending = await prisma.rentInvoice.aggregate({
      where: { tenantId: id, status: { not: "VOIDED" } },
      _sum: { pendingAmount: true },
    });
    if (toNumber(pending._sum.pendingAmount) > 0) {
      throw new ConflictError(
        `Tenant has ₹${toNumber(pending._sum.pendingAmount).toLocaleString("en-IN")} rent outstanding. Collect or adjust it before deleting.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.bedAllocation.updateMany({ where: { tenantId: id, status: "ACTIVE" }, data: { status: "VACATED", endDate: toDateOnly(new Date()) } });
      await tx.tenant.update({ where: { id }, data: { deletedAt: new Date(), status: "VACATED", roomId: null, bedId: null } });
      await tx.auditLog.create({ data: { actorId, action: "TENANT_ARCHIVE", entityType: "tenant", entityId: id } });
    });
    return { id, archived: true };
  },
};
