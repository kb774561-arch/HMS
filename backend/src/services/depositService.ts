import { DepositTxnType, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { toDateOnly } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";
import { buildWhatsAppLink } from "../utils/whatsapp.js";

function totals(rows: { txnType: DepositTxnType; amount: Prisma.Decimal }[]) {
  let received = 0;
  let refunded = 0;
  let deducted = 0;
  for (const r of rows) {
    const amt = toNumber(r.amount);
    if (r.txnType === "COLLECTION") received += amt;
    else if (r.txnType === "REFUND") refunded += amt;
    else deducted += amt;
  }
  return {
    received: roundMoney(received),
    refunded: roundMoney(refunded),
    deducted: roundMoney(deducted),
    balance: roundMoney(received - refunded - deducted),
  };
}

async function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  await tx.$queryRaw`SELECT id FROM genius_pg.tenants WHERE id = ${tenantId} FOR UPDATE`;
  const tenant = await tx.tenant.findFirst({ where: { id: tenantId, deletedAt: null } });
  if (!tenant) throw new ValidationError({ tenantId: "Tenant not found" });
  return tenant;
}

export const depositService = {
  async collect(
    data: {
      tenantId: string;
      amount: number;
      txnDate: string;
      collectionAccountId: string;
      paymentMethod: PaymentMethod;
      notes?: string | null;
    },
    actorId?: string,
  ) {
    const account = await prisma.collectionAccount.findFirst({ where: { id: data.collectionAccountId, isActive: true } });
    if (!account) throw new ValidationError({ collectionAccountId: "Select an active receiving account" });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await lockTenant(tx, data.tenantId);
      const txn = await tx.securityDepositTransaction.create({
        data: {
          tenantId: data.tenantId,
          txnType: "COLLECTION",
          txnDate: toDateOnly(data.txnDate),
          amount: data.amount,
          collectionAccountId: data.collectionAccountId,
          paymentMethod: data.paymentMethod,
          notes: data.notes ?? null,
          createdById: actorId,
        },
      });
      await tx.auditLog.create({
        data: { actorId, action: "DEPOSIT_COLLECT", entityType: "security_deposit_transaction", entityId: txn.id },
      });
      const all = await tx.securityDepositTransaction.findMany({ where: { tenantId: data.tenantId } });
      return { tenant, txn, balance: totals(all).balance };
    });

    const text = `Hello ${result.tenant.tenantName},\n\nWe have received your security deposit of ₹${data.amount.toLocaleString("en-IN")}.\nDeposit held: ₹${result.balance.toLocaleString("en-IN")}.\n\n— Genius Girls PG`;
    return {
      id: result.txn.id,
      amount: data.amount,
      depositBalance: result.balance,
      whatsappLink: buildWhatsAppLink(result.tenant.whatsappNumber, text),
    };
  },

  async refund(
    data: {
      tenantId: string;
      amount: number;
      txnDate: string;
      txnType: "REFUND" | "DEDUCTION" | "ADJUSTMENT_TO_RENT";
      paymentMethod?: PaymentMethod;
      collectionAccountId?: string | null;
      notes?: string | null;
    },
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await lockTenant(tx, data.tenantId);
      const before = totals(await tx.securityDepositTransaction.findMany({ where: { tenantId: data.tenantId } }));
      if (data.amount > before.balance) {
        throw new ValidationError({
          amount: `Cannot exceed the deposit balance of ₹${before.balance.toLocaleString("en-IN")}`,
        });
      }
      const txn = await tx.securityDepositTransaction.create({
        data: {
          tenantId: data.tenantId,
          txnType: data.txnType,
          txnDate: toDateOnly(data.txnDate),
          amount: data.amount,
          paymentMethod: data.paymentMethod ?? null,
          collectionAccountId: data.collectionAccountId || null,
          notes: data.notes ?? null,
          createdById: actorId,
        },
      });
      await tx.auditLog.create({
        data: { actorId, action: `DEPOSIT_${data.txnType}`, entityType: "security_deposit_transaction", entityId: txn.id },
      });
      return { id: txn.id, amount: data.amount, depositBalance: roundMoney(before.balance - data.amount) };
    });
  },

  async summary() {
    const tenants = await prisma.tenant.findMany({
      where: { deletedAt: null },
      include: { deposits: true, room: true, bed: true },
      orderBy: { tenantName: "asc" },
    });

    const items = tenants
      .map((t) => {
        const tt = totals(t.deposits);
        return {
          tenantId: t.id,
          tenantName: t.tenantName,
          roomNumber: t.room?.roomNumber ?? null,
          bedCode: t.bed?.bedCode ?? null,
          status: t.status,
          agreedDeposit: toNumber(t.securityDeposit),
          received: tt.received,
          refunded: roundMoney(tt.refunded + tt.deducted),
          balance: tt.balance,
          dueToCollect: roundMoney(Math.max(toNumber(t.securityDeposit) - tt.received, 0)),
          applied: tt.deducted,
          transactions: t.deposits.length,
          lastTxnDate: t.deposits.reduce<Date | null>((d, x) => (!d || x.txnDate > d ? x.txnDate : d), null),
        };
      })
      .filter((t) => t.transactions > 0 || t.agreedDeposit > 0);

    return {
      items,
      summary: {
        received: roundMoney(items.reduce((s, i) => s + i.received, 0)),
        refunded: roundMoney(items.reduce((s, i) => s + i.refunded - i.applied, 0)),
        applied: roundMoney(items.reduce((s, i) => s + i.applied, 0)),
        balance: roundMoney(items.reduce((s, i) => s + i.balance, 0)),
        dueToCollect: roundMoney(items.reduce((s, i) => s + i.dueToCollect, 0)),
      },
    };
  },

  async ledger(tenantId?: string) {
    const rows = await prisma.securityDepositTransaction.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { tenant: true, collectionAccount: true },
      orderBy: [{ txnDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    });
    return rows.map((d) => ({
      id: d.id,
      tenantName: d.tenant.tenantName,
      tenantId: d.tenantId,
      txnType: d.txnType,
      txnDate: d.txnDate,
      amount: toNumber(d.amount),
      account: d.collectionAccount?.accountName ?? null,
      paymentMethod: d.paymentMethod,
      notes: d.notes,
    }));
  },

  /** Totals of deposit cash movements, optionally only up to a date (liability as of that day). */
  async totals(asOf?: Date, between?: { from: Date; to: Date }) {
    const rows = await prisma.securityDepositTransaction.findMany({
      where: {
        tenant: { deletedAt: null },
        ...(asOf ? { txnDate: { lte: asOf } } : {}),
        ...(between ? { txnDate: { gte: between.from, lte: between.to } } : {}),
      },
      select: { txnType: true, amount: true },
    });
    return totals(rows);
  },

  async balance(tenantId: string) {
    const t = await prisma.tenant.findFirst({ where: { id: tenantId } });
    if (!t) throw new NotFoundError("Tenant not found");
    return totals(await prisma.securityDepositTransaction.findMany({ where: { tenantId } })).balance;
  },
};
