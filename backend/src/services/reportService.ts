import { prisma } from "../config/database.js";
import { NotFoundError } from "../utils/errors.js";
import { monthLabel } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";

export const reportService = {
  /** Chronological rent ledger (invoices as debits, payments as credits) with running balance. */
  async tenantLedger(tenantId: string) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: {
        invoices: { where: { status: { not: "VOIDED" } }, orderBy: [{ billingYear: "asc" }, { billingMonth: "asc" }] },
        payments: { where: { status: "RECORDED" }, orderBy: { paymentDate: "asc" }, include: { receipt: true, collectionAccount: true } },
      },
    });
    if (!tenant) throw new NotFoundError("Tenant not found");

    const entries = [
      ...tenant.invoices.map((i) => ({
        id: i.id,
        date: i.invoiceDate,
        type: "INVOICE" as const,
        description: `Rent — ${monthLabel(i.billingMonth, i.billingYear)}`,
        debit: toNumber(i.totalPayable),
        credit: 0,
      })),
      ...tenant.payments.map((p) => ({
        id: p.id,
        date: p.paymentDate,
        type: "PAYMENT" as const,
        description: `Payment ${p.receipt?.receiptNumber ?? ""} · ${p.collectionAccount.accountName}`.trim(),
        debit: 0,
        credit: toNumber(p.amountReceived),
      })),
    ].sort((a, b) => a.date.getTime() - b.date.getTime() || (a.type === "INVOICE" ? -1 : 1));

    let balance = 0;
    return {
      tenant: { id: tenant.id, tenantName: tenant.tenantName },
      entries: entries.map((e) => {
        balance = roundMoney(balance + e.debit - e.credit);
        return { ...e, balance };
      }),
      closingBalance: balance,
    };
  },
};
