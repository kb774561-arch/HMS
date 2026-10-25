import { prisma } from "../config/database.js";
import { monthEnd, monthLabel, monthStart, nextMonthStart, todayIst } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";
import { depositService } from "./depositService.js";
import { roomService } from "./roomService.js";
import { tenantService } from "./tenantService.js";

const TREND_MONTHS = 6;

/**
 * Month dashboard. Three money views are kept strictly apart:
 *  - billing-month rent  : invoices for the month and what has been allocated to them
 *  - cash in the month   : rent payments by payment date, operating expenses by expense date
 *  - deposits            : a liability, never counted as rent or expense
 */
export const dashboardService = {
  async overview(month: number, year: number) {
    const start = monthStart(year, month);
    const endExclusive = nextMonthStart(year, month);
    const today = todayIst();
    const asOf = monthEnd(year, month) < today ? monthEnd(year, month) : today;

    const trendStart = new Date(Date.UTC(year, month - TREND_MONTHS, 1));
    const invoiceWhere = { billingMonth: month, billingYear: year, status: { not: "VOIDED" as const }, tenant: { deletedAt: null } };

    const [tenants, rooms, invoiceAgg, invoiceCount, pendingCount, rentCash, expenseTotal, expenseByCategory, categories, depositHeld, depositMonth, trendPayments, trendExpenses] =
      await Promise.all([
        tenantService.counts(),
        roomService.summary(),
        prisma.rentInvoice.aggregate({ where: invoiceWhere, _sum: { totalPayable: true, paidAmount: true, pendingAmount: true } }),
        prisma.rentInvoice.count({ where: invoiceWhere }),
        prisma.rentInvoice.count({ where: { ...invoiceWhere, pendingAmount: { gt: 0 } } }),
        prisma.payment.aggregate({
          where: { status: "RECORDED", paymentDate: { gte: start, lt: endExclusive } },
          _sum: { amountReceived: true },
          _count: { _all: true },
        }),
        prisma.expense.aggregate({ where: { voidedAt: null, expenseDate: { gte: start, lt: endExclusive } }, _sum: { amount: true }, _count: { _all: true } }),
        prisma.expense.groupBy({
          by: ["categoryId"],
          where: { voidedAt: null, expenseDate: { gte: start, lt: endExclusive } },
          _sum: { amount: true },
        }),
        prisma.expenseCategory.findMany({ select: { id: true, name: true } }),
        depositService.totals(asOf),
        depositService.totals(undefined, { from: start, to: new Date(endExclusive.getTime() - 86_400_000) }),
        prisma.$queryRaw<{ ym: string; total: number }[]>`
          SELECT to_char(payment_date, 'YYYY-MM') AS ym, SUM(amount_received)::float AS total
          FROM genius_pg.payments
          WHERE status = 'RECORDED' AND payment_date >= ${trendStart} AND payment_date < ${endExclusive}
          GROUP BY 1`,
        prisma.$queryRaw<{ ym: string; total: number }[]>`
          SELECT to_char(expense_date, 'YYYY-MM') AS ym, SUM(amount)::float AS total
          FROM genius_pg.expenses
          WHERE voided_at IS NULL AND expense_date >= ${trendStart} AND expense_date < ${endExclusive}
          GROUP BY 1`,
      ]);

    const expectedRent = roundMoney(toNumber(invoiceAgg._sum.totalPayable));
    const rentCollected = roundMoney(toNumber(invoiceAgg._sum.paidAmount));
    const rentPending = roundMoney(toNumber(invoiceAgg._sum.pendingAmount));
    const rentCashReceived = roundMoney(toNumber(rentCash._sum.amountReceived));
    const expenditure = roundMoney(toNumber(expenseTotal._sum.amount));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));

    const payMap = new Map(trendPayments.map((r) => [r.ym, Number(r.total)]));
    const expMap = new Map(trendExpenses.map((r) => [r.ym, Number(r.total)]));
    const trend = Array.from({ length: TREND_MONTHS }, (_, i) => {
      const d = new Date(Date.UTC(year, month - TREND_MONTHS + i, 1));
      const ym = d.toISOString().slice(0, 7);
      const m = d.getUTCMonth() + 1;
      const y = d.getUTCFullYear();
      const rent = roundMoney(payMap.get(ym) ?? 0);
      const exp = roundMoney(expMap.get(ym) ?? 0);
      return { month: m, year: y, label: monthLabel(m, y).slice(0, 3) + ` ${String(y).slice(2)}`, rentCollected: rent, expenditure: exp, net: roundMoney(rent - exp) };
    });

    return {
      period: { month, year, asOf },
      tenants: { registered: tenants.registered, residing: tenants.residing, unallocated: tenants.unallocated },
      occupancy: {
        totalBeds: rooms.totals.totalBeds,
        occupiedBeds: rooms.totals.occupied,
        availableBeds: rooms.totals.available,
        blockedBeds: rooms.totals.blocked,
        occupancyPercentage: rooms.totals.occupancyPercentage,
      },
      rent: {
        expected: expectedRent,
        collected: rentCollected,
        pending: rentPending,
        invoices: invoiceCount,
        pendingTenants: pendingCount,
        collectedPercentage: expectedRent > 0 ? Math.round((rentCollected / expectedRent) * 100) : 0,
      },
      cash: {
        rentReceived: rentCashReceived,
        paymentCount: rentCash._count._all,
        expenditure,
        expenseCount: expenseTotal._count._all,
        netOperatingCash: roundMoney(rentCashReceived - expenditure),
        depositsReceived: depositMonth.received,
        depositsRefunded: depositMonth.refunded,
      },
      deposits: {
        held: depositHeld.balance,
        received: depositHeld.received,
        refunded: depositHeld.refunded,
        applied: depositHeld.deducted,
      },
      expenseByCategory: expenseByCategory
        .map((c) => ({ category: categoryName.get(c.categoryId) ?? "Other", amount: roundMoney(toNumber(c._sum.amount)) }))
        .sort((a, b) => b.amount - a.amount),
      trend,
    };
  },
};
