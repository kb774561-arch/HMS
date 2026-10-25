import { Prisma, PaymentMethod } from "@prisma/client";
import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { monthLabel, toDateOnly } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";
import { nextReceiptNumber } from "../utils/receiptNumber.js";
import { buildWhatsAppLink } from "../utils/whatsapp.js";

const OPEN_STATUSES = ["PENDING", "PARTIALLY_PAID", "OVERDUE"] as const;

const receiptInclude = {
  receipt: true,
  collectionAccount: true,
  recordedBy: { select: { fullName: true } },
  tenant: { include: { room: true, bed: true } },
  allocations: { include: { invoice: true } },
} satisfies Prisma.PaymentInclude;

type PaymentWithReceipt = Prisma.PaymentGetPayload<{ include: typeof receiptInclude }>;

export type PaymentInput = {
  tenantId: string;
  paymentDate: string;
  amountReceived: number;
  paymentMethod: PaymentMethod;
  collectionAccountId: string;
  transactionReference?: string | null;
  notes?: string | null;
  invoiceIds?: string[];
  idempotencyKey?: string;
};

export const paymentService = {
  /**
   * Records a payment and allocates it to the chosen invoices first, then to any other
   * open invoices oldest-first; anything left is kept as an advance (unallocated).
   * Invoice rows are locked so two collectors cannot over-allocate the same month.
   */
  async create(data: PaymentInput, actorId?: string) {
    if (data.idempotencyKey) {
      const existing = await prisma.payment.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
        include: receiptInclude,
      });
      if (existing) return this.serialize(existing);
    }

    const [tenant, account] = await Promise.all([
      prisma.tenant.findFirst({ where: { id: data.tenantId, deletedAt: null } }),
      prisma.collectionAccount.findFirst({ where: { id: data.collectionAccountId } }),
    ]);
    if (!tenant) throw new ValidationError({ tenantId: "Tenant not found" });
    if (!account || !account.isActive) throw new ValidationError({ collectionAccountId: "Select an active receiving account" });

    const paymentDate = toDateOnly(data.paymentDate);
    const amount = roundMoney(data.amountReceived);

    const payment = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM genius_pg.rent_invoices
          WHERE tenant_id = ${data.tenantId} AND status::text IN ('PENDING','PARTIALLY_PAID','OVERDUE')
          FOR UPDATE`;

        const open = await tx.rentInvoice.findMany({
          where: { tenantId: data.tenantId, status: { in: [...OPEN_STATUSES] }, pendingAmount: { gt: 0 } },
          orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }],
        });
        const preferred = new Set(data.invoiceIds ?? []);
        const ordered = [...open.filter((i) => preferred.has(i.id)), ...open.filter((i) => !preferred.has(i.id))];

        let remaining = amount;
        const allocations: { invoiceId: string; amount: number }[] = [];
        for (const inv of ordered) {
          if (remaining <= 0) break;
          const apply = roundMoney(Math.min(toNumber(inv.pendingAmount), remaining));
          if (apply <= 0) continue;
          const paidAmount = roundMoney(toNumber(inv.paidAmount) + apply);
          const pendingAmount = roundMoney(Math.max(toNumber(inv.totalPayable) - paidAmount, 0));
          await tx.rentInvoice.update({
            where: { id: inv.id },
            data: { paidAmount, pendingAmount, status: pendingAmount <= 0 ? "PAID" : "PARTIALLY_PAID" },
          });
          allocations.push({ invoiceId: inv.id, amount: apply });
          remaining = roundMoney(remaining - apply);
        }

        const receiptNumber = await nextReceiptNumber(tx, paymentDate);
        const created = await tx.payment.create({
          data: {
            tenantId: data.tenantId,
            paymentDate,
            amountReceived: amount,
            allocatedAmount: roundMoney(amount - remaining),
            unallocatedAmount: remaining,
            paymentMethod: data.paymentMethod,
            collectionAccountId: data.collectionAccountId,
            transactionReference: data.transactionReference ?? null,
            notes: data.notes ?? null,
            idempotencyKey: data.idempotencyKey,
            recordedById: actorId,
            allocations: { create: allocations },
            receipt: { create: { receiptNumber, receiptDate: paymentDate } },
          },
          include: receiptInclude,
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: "PAYMENT_CREATE",
            entityType: "payment",
            entityId: created.id,
            metadata: { amount, receiptNumber, allocations },
          },
        });
        return created;
      },
      { timeout: 20_000 },
    );

    return this.serialize(payment);
  },

  async serialize(p: PaymentWithReceipt) {
    const [outstandingAgg, pg] = await Promise.all([
      prisma.rentInvoice.aggregate({
        where: { tenantId: p.tenantId, status: { in: [...OPEN_STATUSES] } },
        _sum: { pendingAmount: true },
      }),
      prisma.pgProperty.findFirst({ where: { isActive: true } }),
    ]);
    const amount = toNumber(p.amountReceived);
    const receiptNumber = p.receipt?.receiptNumber ?? null;
    const outstandingAfter = roundMoney(toNumber(outstandingAgg._sum.pendingAmount));
    const months = p.allocations
      .map((a) => ({
        label: monthLabel(a.invoice.billingMonth, a.invoice.billingYear),
        amount: toNumber(a.amount),
        billingMonth: a.invoice.billingMonth,
        billingYear: a.invoice.billingYear,
      }))
      .sort((a, b) => a.billingYear - b.billingYear || a.billingMonth - b.billingMonth);

    const whatsappText = [
      `Hello ${p.tenant.tenantName},`,
      "",
      `We have received your payment of ₹${amount.toLocaleString("en-IN")}${months.length ? ` for ${months.map((m) => m.label).join(", ")}` : ""}.`,
      `Receipt No: ${receiptNumber}`,
      outstandingAfter > 0 ? `Balance due: ₹${outstandingAfter.toLocaleString("en-IN")}` : "No rent is pending. Thank you!",
      "",
      `— ${pg?.name ?? "Genius Girls PG"}`,
    ].join("\n");

    return {
      id: p.id,
      tenantId: p.tenantId,
      tenantName: p.tenant.tenantName,
      roomNumber: p.tenant.room?.roomNumber ?? null,
      bedCode: p.tenant.bed?.bedCode ?? null,
      whatsappNumber: p.tenant.whatsappNumber,
      paymentDate: p.paymentDate,
      amountReceived: amount,
      allocatedAmount: toNumber(p.allocatedAmount),
      unallocatedAmount: toNumber(p.unallocatedAmount),
      paymentMethod: p.paymentMethod,
      account: p.collectionAccount.accountName,
      transactionReference: p.transactionReference,
      notes: p.notes,
      status: p.status,
      recordedBy: p.recordedBy?.fullName ?? null,
      receiptNumber,
      receiptDate: p.receipt?.receiptDate ?? null,
      months,
      outstandingAfter,
      pg: { name: pg?.name ?? "Genius Girls PG", address: pg?.address ?? null, phone: pg?.phone ?? null },
      whatsappLink: buildWhatsAppLink(p.tenant.whatsappNumber, whatsappText),
      whatsappText,
    };
  },

  async list(filters: {
    from?: string;
    to?: string;
    tenantId?: string;
    accountId?: string;
    method?: string;
    search?: string;
  }) {
    const where: Prisma.PaymentWhereInput = { status: "RECORDED" };
    if (filters.tenantId) where.tenantId = filters.tenantId;
    if (filters.accountId) where.collectionAccountId = filters.accountId;
    if (filters.method && filters.method in PaymentMethod) where.paymentMethod = filters.method as PaymentMethod;
    if (filters.from || filters.to) {
      where.paymentDate = {
        ...(filters.from ? { gte: toDateOnly(filters.from) } : {}),
        ...(filters.to ? { lte: toDateOnly(filters.to) } : {}),
      };
    }
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { tenant: { tenantName: { contains: search, mode: "insensitive" } } },
        { receipt: { receiptNumber: { contains: search, mode: "insensitive" } } },
        { transactionReference: { contains: search, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.payment.findMany({
      where,
      include: {
        tenant: { include: { room: true, bed: true } },
        collectionAccount: true,
        receipt: true,
        recordedBy: { select: { fullName: true } },
      },
      orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });

    const items = rows.map((p) => ({
      id: p.id,
      paymentDate: p.paymentDate,
      createdAt: p.createdAt,
      tenantName: p.tenant.tenantName,
      tenantId: p.tenantId,
      roomNumber: p.tenant.room?.roomNumber ?? null,
      bedCode: p.tenant.bed?.bedCode ?? null,
      amountReceived: toNumber(p.amountReceived),
      allocatedAmount: toNumber(p.allocatedAmount),
      unallocatedAmount: toNumber(p.unallocatedAmount),
      paymentMethod: p.paymentMethod,
      accountId: p.collectionAccountId,
      account: p.collectionAccount.accountName,
      transactionReference: p.transactionReference,
      notes: p.notes,
      receiptNumber: p.receipt?.receiptNumber ?? null,
      recordedBy: p.recordedBy?.fullName ?? null,
    }));

    const byAccount = new Map<string, number>();
    for (const p of items) byAccount.set(p.account, roundMoney((byAccount.get(p.account) ?? 0) + p.amountReceived));
    const total = roundMoney(items.reduce((s, p) => s + p.amountReceived, 0));
    const cash = roundMoney(items.filter((p) => p.paymentMethod === "CASH").reduce((s, p) => s + p.amountReceived, 0));

    return {
      items,
      summary: {
        total,
        count: items.length,
        cash,
        online: roundMoney(total - cash),
        accounts: [...byAccount.entries()]
          .map(([account, amount]) => ({ account, amount }))
          .sort((a, b) => b.amount - a.amount),
      },
    };
  },

  async getReceipt(paymentId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: receiptInclude });
    if (!payment || !payment.receipt) throw new NotFoundError("Receipt not found");
    return this.serialize(payment);
  },
};
