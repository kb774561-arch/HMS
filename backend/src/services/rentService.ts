import { Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import { daysInMonth, monthEnd, monthLabel, monthStart, toDateOnly } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";
import { naturalCompare } from "./roomService.js";

const OPEN_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;
const DAY = 86_400_000;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const inclusiveDays = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY) + 1;

/** Billing policy: daily rate = monthly rent ÷ days in that month; both period dates are chargeable. */
export function proratedRent(monthlyRent: number, from: Date, to: Date, year: number, month: number) {
  const total = daysInMonth(year, month);
  const days = Math.max(0, inclusiveDays(from, to));
  const amount = days >= total ? monthlyRent : roundMoney((monthlyRent * days) / total);
  return { days, totalDays: total, amount };
}

type TenantForBilling = {
  joiningDate: Date;
  leavingDate: Date | null;
  allocations: { startDate: Date; endDate: Date | null }[];
};

/**
 * Chargeable window inside the month: the tenant's stay (joining → leaving) intersected
 * with their bed allocations. No allocation in the month → no window (not auto-billed).
 */
function chargeableWindow(t: TenantForBilling, year: number, month: number) {
  const mStart = monthStart(year, month);
  const mEnd = monthEnd(year, month);
  const overlapping = t.allocations.filter((a) => a.startDate <= mEnd && (!a.endDate || a.endDate >= mStart));
  if (!overlapping.length) return null;

  const allocStart = new Date(Math.min(...overlapping.map((a) => a.startDate.getTime())));
  const allocEnd = overlapping.some((a) => !a.endDate)
    ? mEnd
    : new Date(Math.max(...overlapping.map((a) => a.endDate!.getTime())));

  const from = new Date(Math.max(mStart.getTime(), t.joiningDate.getTime(), allocStart.getTime()));
  const to = new Date(Math.min(mEnd.getTime(), allocEnd.getTime(), (t.leavingDate ?? mEnd).getTime()));
  return from <= to ? { from, to } : null;
}

/** Tenants with an active stay, not yet billed for the month, who held a bed during it. */
async function billableTenants(month: number, year: number) {
  const mStart = monthStart(year, month);
  const mEnd = monthEnd(year, month);
  const tenants = await prisma.tenant.findMany({
    where: {
      deletedAt: null,
      status: { in: ["ACTIVE", "NOTICE"] },
      // No agreed rent yet → nothing to bill automatically (shown as "rent not set").
      monthlyRent: { gt: 0 },
      joiningDate: { lte: mEnd },
      OR: [{ leavingDate: null }, { leavingDate: { gte: mStart } }],
      invoices: { none: { billingMonth: month, billingYear: year } },
      allocations: { some: { startDate: { lte: mEnd }, OR: [{ endDate: null }, { endDate: { gte: mStart } }] } },
    },
    include: { allocations: { select: { startDate: true, endDate: true } } },
  });
  return tenants
    .map((t) => ({ tenant: t, window: chargeableWindow(t, year, month) }))
    .filter((x): x is { tenant: (typeof tenants)[number]; window: { from: Date; to: Date } } => x.window !== null);
}

async function pendingCharges(tx: Prisma.TransactionClient, tenantId: string, month: number, year: number) {
  return tx.additionalCharge.findMany({
    where: { tenantId, billingMonth: month, billingYear: year, pendingAmount: { gt: 0 } },
    include: { chargeType: true },
  });
}

function isDuplicate(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export const rentService = {
  async generate(month: number, year: number, actorId?: string) {
    const candidates = await billableTenants(month, year);
    let created = 0;
    let skipped = 0;
    const results: { tenantId: string; tenantName: string; status: string; amount?: number }[] = [];

    for (const { tenant, window } of candidates) {
      const rate = toNumber(tenant.monthlyRent);
      const { days, totalDays, amount: baseRent } = proratedRent(rate, window.from, window.to, year, month);
      const note = days < totalDays ? `Rent for ${monthLabel(month, year)} (${days}/${totalDays} days)` : `Rent for ${monthLabel(month, year)}`;

      try {
        const totalPayable = await prisma.$transaction(async (tx) => {
          const charges = await pendingCharges(tx, tenant.id, month, year);
          const additionalCharges = roundMoney(charges.reduce((s, c) => s + toNumber(c.pendingAmount), 0));
          const total = roundMoney(baseRent + additionalCharges);
          await tx.rentInvoice.create({
            data: {
              tenantId: tenant.id,
              billingMonth: month,
              billingYear: year,
              invoiceDate: monthStart(year, month),
              dueDate: new Date(Date.UTC(year, month - 1, 10)),
              baseRent,
              additionalCharges,
              discount: 0,
              totalPayable: total,
              paidAmount: 0,
              pendingAmount: total,
              status: total > 0 ? "PENDING" : "PAID",
              source: "AUTO",
              periodFrom: window.from,
              periodTo: window.to,
              rentRate: rate,
              originalAmount: baseRent,
              createdById: actorId,
              items: {
                create: [
                  { description: note, amount: baseRent, itemType: "RENT" },
                  ...charges.map((c) => ({ description: c.description || c.chargeType.name, amount: toNumber(c.pendingAmount), itemType: "CHARGE" })),
                ],
              },
            },
          });
          return total;
        });
        created++;
        results.push({ tenantId: tenant.id, tenantName: tenant.tenantName, status: "CREATED", amount: totalPayable });
      } catch (err) {
        // A concurrent Generate or a manual entry already billed this tenant.
        if (!isDuplicate(err)) throw err;
        skipped++;
        results.push({ tenantId: tenant.id, tenantName: tenant.tenantName, status: "SKIPPED_EXISTS" });
      }
    }

    await prisma.auditLog.create({
      data: { actorId, action: "RENT_GENERATE", entityType: "rent_invoice", metadata: { month, year, created, skipped } },
    });
    return { month, year, created, skipped, results };
  },

  /** Everything the Monthly Rent screen needs for one month in a single call. */
  async overview(month: number, year: number) {
    const [invoices, candidates, unallocated, rentNotSet] = await Promise.all([
      prisma.rentInvoice.findMany({
        where: { billingMonth: month, billingYear: year, status: { not: "VOIDED" }, tenant: { deletedAt: null } },
        include: {
          tenant: { include: { room: true, bed: true } },
          createdBy: { select: { fullName: true } },
          adjustedBy: { select: { fullName: true } },
        },
      }),
      billableTenants(month, year),
      prisma.tenant.count({
        where: {
          deletedAt: null,
          status: { in: ["ACTIVE", "NOTICE"] },
          bedId: null,
          invoices: { none: { billingMonth: month, billingYear: year } },
        },
      }),
      prisma.tenant.findMany({
        where: { deletedAt: null, status: { in: ["ACTIVE", "NOTICE"] }, monthlyRent: { lte: 0 } },
        select: { id: true, tenantName: true },
        orderBy: { tenantName: "asc" },
      }),
    ]);

    const items = invoices
      .map((i) => ({
        id: i.id,
        tenantId: i.tenantId,
        tenantName: i.tenant.tenantName,
        tenantStatus: i.tenant.status,
        whatsappNumber: i.tenant.whatsappNumber,
        roomNumber: i.tenant.room?.roomNumber ?? null,
        bedCode: i.tenant.bed?.bedCode ?? null,
        monthlyRent: toNumber(i.tenant.monthlyRent),
        billingMonth: i.billingMonth,
        billingYear: i.billingYear,
        baseRent: toNumber(i.baseRent),
        additionalCharges: toNumber(i.additionalCharges),
        discount: toNumber(i.discount),
        totalPayable: toNumber(i.totalPayable),
        paidAmount: toNumber(i.paidAmount),
        pendingAmount: toNumber(i.pendingAmount),
        status: i.status,
        dueDate: i.dueDate,
        source: i.source,
        periodFrom: i.periodFrom,
        periodTo: i.periodTo,
        rentRate: i.rentRate == null ? null : toNumber(i.rentRate),
        originalAmount: i.originalAmount == null ? null : toNumber(i.originalAmount),
        adjustmentReason: i.adjustmentReason,
        notes: i.notes,
        createdBy: i.createdBy?.fullName ?? null,
        adjustedBy: i.adjustedBy?.fullName ?? null,
        adjustedAt: i.adjustedAt,
      }))
      .sort((a, b) => naturalCompare(a.roomNumber ?? "~", b.roomNumber ?? "~") || a.tenantName.localeCompare(b.tenantName));

    return {
      month,
      year,
      items,
      notGenerated: candidates.length,
      unallocatedWithoutInvoice: unallocated,
      rentNotSet,
      summary: {
        totalDue: roundMoney(items.reduce((s, i) => s + i.totalPayable, 0)),
        collected: roundMoney(items.reduce((s, i) => s + i.paidAmount, 0)),
        pending: roundMoney(items.reduce((s, i) => s + i.pendingAmount, 0)),
        paidTenants: items.filter((i) => i.pendingAmount <= 0).length,
        pendingTenants: items.filter((i) => i.pendingAmount > 0).length,
        invoices: items.length,
        manual: items.filter((i) => i.source === "MANUAL").length,
      },
    };
  },

  /** Suggested amount and context for the Manual Rent Entry form. */
  async manualPreview(params: { tenantId: string; month: number; year: number; from?: string; to?: string }) {
    const { tenantId, month, year } = params;
    const t = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: { allocations: { include: { room: true, bed: true }, orderBy: { startDate: "asc" } } },
    });
    if (!t) throw new NotFoundError("Tenant not found");

    const mStart = monthStart(year, month);
    const mEnd = monthEnd(year, month);
    const window = chargeableWindow(t, year, month);
    // Unallocated tenants: suggest from the (actual) joining date to month end.
    const defaultFrom = window?.from ?? new Date(Math.max(mStart.getTime(), t.joiningDate.getTime()));
    const defaultTo = window?.to ?? new Date(Math.min(mEnd.getTime(), (t.leavingDate ?? mEnd).getTime()));

    const from = params.from ? toDateOnly(params.from) : defaultFrom;
    const to = params.to ? toDateOnly(params.to) : defaultTo;
    const rate = toNumber(t.monthlyRent);
    const calc = from <= to ? proratedRent(rate, from, to, year, month) : { days: 0, totalDays: daysInMonth(year, month), amount: 0 };

    const allocation =
      t.allocations.filter((a) => a.startDate <= mEnd && (!a.endDate || a.endDate >= mStart)).at(-1) ??
      t.allocations.find((a) => a.status === "ACTIVE") ??
      null;
    const existing = await prisma.rentInvoice.findUnique({
      where: { tenantId_billingMonth_billingYear: { tenantId, billingMonth: month, billingYear: year } },
    });

    return {
      tenant: {
        id: t.id,
        tenantName: t.tenantName,
        joiningDate: t.joiningDate,
        leavingDate: t.leavingDate,
        monthlyRent: rate,
        accommodation: t.bedId ? "RESIDING" : "UNALLOCATED",
      },
      allocation: allocation
        ? {
            roomNumber: allocation.room.roomNumber,
            bedCode: allocation.bed.bedCode,
            startDate: allocation.startDate,
            endDate: allocation.endDate,
            current: allocation.status === "ACTIVE",
          }
        : null,
      defaultFrom: iso(defaultFrom),
      defaultTo: iso(defaultTo),
      periodFrom: iso(from),
      periodTo: iso(to),
      chargeableDays: calc.days,
      daysInMonth: calc.totalDays,
      suggestedAmount: calc.amount,
      existingInvoice:
        existing && existing.status !== "VOIDED"
          ? {
              id: existing.id,
              source: existing.source,
              baseRent: toNumber(existing.baseRent),
              totalPayable: toNumber(existing.totalPayable),
              paidAmount: toNumber(existing.paidAmount),
              pendingAmount: toNumber(existing.pendingAmount),
              status: existing.status,
            }
          : null,
    };
  },

  /** Manual Rent Entry — creates an invoice that behaves exactly like an auto-generated one. */
  async manualCreate(
    input: {
      tenantId: string;
      month: number;
      year: number;
      periodFrom: string;
      periodTo: string;
      amount: number;
      dueDate?: string | null;
      reason?: string | null;
      notes?: string | null;
    },
    actor: { id?: string; canOverride: boolean },
  ) {
    const preview = await this.manualPreview({ tenantId: input.tenantId, month: input.month, year: input.year, from: input.periodFrom, to: input.periodTo });
    if (preview.existingInvoice) {
      throw new ConflictError(
        `${preview.tenant.tenantName} already has rent for ${monthLabel(input.month, input.year)}. Adjust that invoice instead.`,
        { existingInvoice: preview.existingInvoice },
      );
    }

    const overridden = Math.abs(input.amount - preview.suggestedAmount) >= 0.01;
    if (overridden && !input.reason) {
      throw new ValidationError({ reason: `Give a reason for changing the calculated amount (₹${preview.suggestedAmount.toLocaleString("en-IN")})` });
    }
    if (overridden && !actor.canOverride) {
      throw new ForbiddenError("You can't override the calculated rent. Use the suggested amount or ask an authorised user.");
    }

    const from = toDateOnly(input.periodFrom);
    const to = toDateOnly(input.periodTo);
    const label =
      preview.chargeableDays < preview.daysInMonth
        ? `Rent for ${monthLabel(input.month, input.year)} (${preview.chargeableDays}/${preview.daysInMonth} days, manual)`
        : `Rent for ${monthLabel(input.month, input.year)} (manual)`;

    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const charges = await pendingCharges(tx, input.tenantId, input.month, input.year);
        const additionalCharges = roundMoney(charges.reduce((s, c) => s + toNumber(c.pendingAmount), 0));
        const total = roundMoney(input.amount + additionalCharges);
        const created = await tx.rentInvoice.create({
          data: {
            tenantId: input.tenantId,
            billingMonth: input.month,
            billingYear: input.year,
            invoiceDate: monthStart(input.year, input.month),
            dueDate: input.dueDate ? toDateOnly(input.dueDate) : new Date(Date.UTC(input.year, input.month - 1, 10)),
            baseRent: input.amount,
            additionalCharges,
            discount: 0,
            totalPayable: total,
            paidAmount: 0,
            pendingAmount: total,
            status: total > 0 ? "PENDING" : "PAID",
            source: "MANUAL",
            periodFrom: from,
            periodTo: to,
            rentRate: preview.tenant.monthlyRent,
            originalAmount: preview.suggestedAmount,
            adjustmentReason: overridden ? input.reason : null,
            notes: input.notes ?? null,
            createdById: actor.id,
            items: {
              create: [
                { description: label, amount: input.amount, itemType: "RENT" },
                ...charges.map((c) => ({ description: c.description || c.chargeType.name, amount: toNumber(c.pendingAmount), itemType: "CHARGE" })),
              ],
            },
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            action: "RENT_MANUAL_CREATE",
            entityType: "rent_invoice",
            entityId: created.id,
            metadata: { suggested: preview.suggestedAmount, amount: input.amount, reason: input.reason ?? null, from: input.periodFrom, to: input.periodTo },
          },
        });
        return created;
      });
      return { id: invoice.id, tenantId: invoice.tenantId, totalPayable: toNumber(invoice.totalPayable) };
    } catch (err) {
      if (isDuplicate(err)) throw new ConflictError("Rent for this tenant and month was just created by someone else.");
      throw err;
    }
  },

  /**
   * Authorised adjustment of an invoice's rent amount. Payments are never touched;
   * the first pre-adjustment amount is kept in originalAmount.
   */
  async adjustInvoice(invoiceId: string, input: { amount: number; reason: string }, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM genius_pg.rent_invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await tx.rentInvoice.findUnique({ where: { id: invoiceId }, include: { items: true } });
      if (!inv || inv.status === "VOIDED") throw new NotFoundError("Invoice not found");

      const paid = toNumber(inv.paidAmount);
      const total = roundMoney(input.amount + toNumber(inv.additionalCharges) - toNumber(inv.discount));
      if (total < paid) {
        throw new ValidationError({ amount: `Already paid ₹${paid.toLocaleString("en-IN")} — the bill can't be lower than that` });
      }
      const pending = roundMoney(total - paid);
      const oldRent = toNumber(inv.baseRent);

      const rentItem = inv.items.find((i) => i.itemType === "RENT");
      if (rentItem) await tx.rentInvoiceItem.update({ where: { id: rentItem.id }, data: { amount: input.amount } });

      await tx.rentInvoice.update({
        where: { id: invoiceId },
        data: {
          baseRent: input.amount,
          totalPayable: total,
          pendingAmount: pending,
          status: pending <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "PENDING",
          originalAmount: inv.originalAmount ?? inv.baseRent,
          adjustmentReason: input.reason,
          adjustedById: actorId,
          adjustedAt: new Date(),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "RENT_ADJUST",
          entityType: "rent_invoice",
          entityId: invoiceId,
          metadata: { oldRent, newRent: input.amount, reason: input.reason },
        },
      });
      return { id: invoiceId, totalPayable: total, pendingAmount: pending };
    });
  },

  async outstandingForTenant(tenantId: string) {
    const invoices = await prisma.rentInvoice.findMany({
      where: { tenantId, status: { in: [...OPEN_STATUSES] }, pendingAmount: { gt: 0 } },
      orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
    });
    return invoices.map((i) => ({
      id: i.id,
      billingMonth: i.billingMonth,
      billingYear: i.billingYear,
      label: monthLabel(i.billingMonth, i.billingYear),
      pendingAmount: toNumber(i.pendingAmount),
      totalPayable: toNumber(i.totalPayable),
      paidAmount: toNumber(i.paidAmount),
      status: i.status,
    }));
  },

  async adjust(
    data: { tenantId: string; amount: number; adjustmentType: string; reason?: string | null; effectiveDate: string; invoiceId?: string },
    actorId?: string,
  ) {
    const tenant = await prisma.tenant.findFirst({ where: { id: data.tenantId, deletedAt: null } });
    if (!tenant) throw new NotFoundError("Tenant not found");

    return prisma.$transaction(async (tx) => {
      const adj = await tx.financialAdjustment.create({
        data: {
          tenantId: data.tenantId,
          amount: data.amount,
          adjustmentType: data.adjustmentType,
          reason: data.reason ?? undefined,
          effectiveDate: toDateOnly(data.effectiveDate),
        },
      });
      if (data.invoiceId) {
        await tx.$queryRaw`SELECT id FROM genius_pg.rent_invoices WHERE id = ${data.invoiceId} FOR UPDATE`;
        const inv = await tx.rentInvoice.findUnique({ where: { id: data.invoiceId } });
        if (!inv || inv.tenantId !== data.tenantId) throw new NotFoundError("Invoice not found");
        const discount = roundMoney(toNumber(inv.discount) + Math.max(data.amount, 0));
        const totalPayable = roundMoney(toNumber(inv.baseRent) + toNumber(inv.additionalCharges) - discount);
        if (totalPayable < 0) throw new AppError("Discount cannot exceed the invoice amount", 422);
        const pendingAmount = roundMoney(Math.max(totalPayable - toNumber(inv.paidAmount), 0));
        const status = pendingAmount <= 0 ? "PAID" : toNumber(inv.paidAmount) > 0 ? "PARTIALLY_PAID" : "PENDING";
        await tx.rentInvoice.update({ where: { id: data.invoiceId }, data: { discount, totalPayable, pendingAmount, status } });
      }
      await tx.auditLog.create({
        data: { actorId, action: "RENT_ADJUSTMENT", entityType: "financial_adjustment", entityId: adj.id },
      });
      return adj;
    });
  },
};
