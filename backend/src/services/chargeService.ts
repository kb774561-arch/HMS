import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";
import { toDateOnly } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";

async function assertUniqueType(name: string, exceptId?: string) {
  const dup = await prisma.chargeType.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (dup) throw new ValidationError({ name: "A charge type with this name already exists" });
}

export const chargeService = {
  listTypes() {
    return prisma.chargeType.findMany({ orderBy: { name: "asc" } });
  },

  async createType(data: { name: string; description?: string | null }) {
    await assertUniqueType(data.name);
    return prisma.chargeType.create({ data: { name: data.name, description: data.description } });
  },

  async updateType(id: string, data: { name?: string; description?: string | null; isActive?: boolean }) {
    if (data.name) await assertUniqueType(data.name, id);
    return prisma.chargeType.update({ where: { id }, data });
  },

  async createCharge(data: {
    tenantId: string;
    chargeTypeId: string;
    chargeDate: string;
    amount: number;
    description?: string | null;
    billingMonth?: number;
    billingYear?: number;
  }) {
    const [tenant, type] = await Promise.all([
      prisma.tenant.findFirst({ where: { id: data.tenantId, deletedAt: null } }),
      prisma.chargeType.findFirst({ where: { id: data.chargeTypeId, isActive: true } }),
    ]);
    if (!tenant) throw new NotFoundError("Tenant not found");
    if (!type) throw new ValidationError({ chargeTypeId: "Select an active charge type" });

    const date = toDateOnly(data.chargeDate);
    // Billed with the month it falls in unless told otherwise.
    const billingMonth = data.billingMonth ?? date.getUTCMonth() + 1;
    const billingYear = data.billingYear ?? date.getUTCFullYear();

    return prisma.$transaction(async (tx) => {
      const charge = await tx.additionalCharge.create({
        data: {
          tenantId: data.tenantId,
          chargeTypeId: data.chargeTypeId,
          chargeDate: date,
          amount: data.amount,
          paidAmount: 0,
          pendingAmount: data.amount,
          description: data.description,
          billingMonth,
          billingYear,
        },
      });

      // Rent for that month may already be generated: add the charge to it now,
      // otherwise "Generate rent" will pick it up.
      await tx.$queryRaw`
        SELECT id FROM genius_pg.rent_invoices
        WHERE tenant_id = ${data.tenantId} AND billing_month = ${billingMonth} AND billing_year = ${billingYear}
        FOR UPDATE`;
      const invoice = await tx.rentInvoice.findUnique({
        where: { tenantId_billingMonth_billingYear: { tenantId: data.tenantId, billingMonth, billingYear } },
      });
      if (invoice && invoice.status !== "VOIDED") {
        const totalPayable = roundMoney(toNumber(invoice.totalPayable) + data.amount);
        const pendingAmount = roundMoney(toNumber(invoice.pendingAmount) + data.amount);
        await tx.rentInvoice.update({
          where: { id: invoice.id },
          data: {
            additionalCharges: roundMoney(toNumber(invoice.additionalCharges) + data.amount),
            totalPayable,
            pendingAmount,
            status: toNumber(invoice.paidAmount) > 0 ? "PARTIALLY_PAID" : "PENDING",
            items: { create: { description: data.description || type.name, amount: data.amount, itemType: "CHARGE" } },
          },
        });
      }
      return charge;
    });
  },

  async listCharges(tenantId?: string) {
    const rows = await prisma.additionalCharge.findMany({
      where: tenantId ? { tenantId } : undefined,
      include: { chargeType: true, tenant: { include: { room: true } } },
      orderBy: { chargeDate: "desc" },
      take: 500,
    });
    return rows.map((c) => ({
      id: c.id,
      tenantId: c.tenantId,
      tenantName: c.tenant.tenantName,
      roomNumber: c.tenant.room?.roomNumber ?? null,
      chargeType: c.chargeType.name,
      chargeDate: c.chargeDate,
      amount: toNumber(c.amount),
      paidAmount: toNumber(c.paidAmount),
      pendingAmount: toNumber(c.pendingAmount),
      description: c.description,
      billingMonth: c.billingMonth,
      billingYear: c.billingYear,
    }));
  },
};
