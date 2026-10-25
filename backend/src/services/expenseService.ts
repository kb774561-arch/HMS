import { PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "../config/database.js";
import { ConflictError, NotFoundError, ValidationError } from "../utils/errors.js";
import { toDateOnly } from "../utils/dates.js";
import { roundMoney, toNumber } from "../utils/money.js";

export type ExpenseInput = {
  expenseDate: string;
  categoryId: string;
  description: string;
  amount: number;
  paymentMethod: PaymentMethod;
  collectionAccountId: string;
  transactionReference?: string | null;
  notes?: string | null;
};

const include = {
  category: true,
  collectionAccount: true,
  createdBy: { select: { fullName: true } },
  updatedBy: { select: { fullName: true } },
} satisfies Prisma.ExpenseInclude;

function serialize(e: Prisma.ExpenseGetPayload<{ include: typeof include }>) {
  return {
    id: e.id,
    expenseDate: e.expenseDate,
    categoryId: e.categoryId,
    category: e.category.name,
    description: e.description,
    amount: toNumber(e.amount),
    paymentMethod: e.paymentMethod,
    collectionAccountId: e.collectionAccountId,
    account: e.collectionAccount.accountName,
    transactionReference: e.transactionReference,
    notes: e.notes,
    createdBy: e.createdBy?.fullName ?? null,
    updatedBy: e.updatedBy?.fullName ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
    voidedAt: e.voidedAt,
    voidReason: e.voidReason,
  };
}

async function validateRefs(input: { categoryId?: string; collectionAccountId?: string }) {
  const [category, account] = await Promise.all([
    input.categoryId ? prisma.expenseCategory.findUnique({ where: { id: input.categoryId } }) : null,
    input.collectionAccountId ? prisma.collectionAccount.findUnique({ where: { id: input.collectionAccountId } }) : null,
  ]);
  if (input.categoryId && (!category || !category.isActive)) throw new ValidationError({ categoryId: "Choose an active category" });
  if (input.collectionAccountId && (!account || !account.isActive)) {
    throw new ValidationError({ collectionAccountId: "Choose an active account" });
  }
}

export const expenseService = {
  async list(filters: { from?: string; to?: string; categoryId?: string; search?: string; includeVoided?: boolean }) {
    const where: Prisma.ExpenseWhereInput = {};
    if (!filters.includeVoided) where.voidedAt = null;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.from || filters.to) {
      where.expenseDate = {
        ...(filters.from ? { gte: toDateOnly(filters.from) } : {}),
        ...(filters.to ? { lte: toDateOnly(filters.to) } : {}),
      };
    }
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { description: { contains: search, mode: "insensitive" } },
        { notes: { contains: search, mode: "insensitive" } },
        { transactionReference: { contains: search, mode: "insensitive" } },
      ];
    }

    const rows = await prisma.expense.findMany({ where, include, orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }], take: 2000 });
    const items = rows.map(serialize);
    const live = items.filter((e) => !e.voidedAt);
    const byCategory = new Map<string, number>();
    for (const e of live) byCategory.set(e.category, roundMoney((byCategory.get(e.category) ?? 0) + e.amount));

    return {
      items,
      summary: {
        total: roundMoney(live.reduce((s, e) => s + e.amount, 0)),
        count: live.length,
        voided: items.length - live.length,
        byCategory: [...byCategory.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
      },
    };
  },

  async get(id: string) {
    const e = await prisma.expense.findUnique({ where: { id }, include });
    if (!e) throw new NotFoundError("Expense not found");
    return serialize(e);
  },

  async create(input: ExpenseInput, actorId?: string) {
    await validateRefs(input);
    const e = await prisma.$transaction(async (tx) => {
      const created = await tx.expense.create({
        data: { ...input, expenseDate: toDateOnly(input.expenseDate), createdById: actorId, updatedById: actorId },
        include,
      });
      await tx.auditLog.create({
        data: { actorId, action: "EXPENSE_CREATE", entityType: "expense", entityId: created.id, metadata: { amount: input.amount, category: created.category.name } },
      });
      return created;
    });
    return serialize(e);
  },

  async update(id: string, input: Partial<ExpenseInput>, actorId?: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Expense not found");
    if (existing.voidedAt) throw new ConflictError("This expense is voided and can't be edited");
    await validateRefs(input);

    const e = await prisma.$transaction(async (tx) => {
      const updated = await tx.expense.update({
        where: { id },
        data: { ...input, ...(input.expenseDate ? { expenseDate: toDateOnly(input.expenseDate) } : {}), updatedById: actorId },
        include,
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "EXPENSE_UPDATE",
          entityType: "expense",
          entityId: id,
          metadata: { before: { amount: toNumber(existing.amount), date: existing.expenseDate, categoryId: existing.categoryId }, after: input } as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
    return serialize(e);
  },

  /** Financial history is never deleted — a voided expense drops out of totals but stays on record. */
  async void(id: string, reason: string, actorId?: string) {
    const existing = await prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Expense not found");
    if (existing.voidedAt) throw new ConflictError("This expense is already voided");
    await prisma.$transaction([
      prisma.expense.update({ where: { id }, data: { voidedAt: new Date(), voidedById: actorId, voidReason: reason, updatedById: actorId } }),
      prisma.auditLog.create({ data: { actorId, action: "EXPENSE_VOID", entityType: "expense", entityId: id, metadata: { reason } } }),
    ]);
    return { id, voided: true };
  },

  listCategories() {
    return prisma.expenseCategory.findMany({ orderBy: [{ isActive: "desc" }, { name: "asc" }] });
  },

  async createCategory(data: { name: string; description?: string | null }) {
    const dup = await prisma.expenseCategory.findFirst({ where: { name: { equals: data.name, mode: "insensitive" } } });
    if (dup) throw new ValidationError({ name: "This category already exists" });
    return prisma.expenseCategory.create({ data });
  },

  async updateCategory(id: string, data: { name?: string; description?: string | null; isActive?: boolean }) {
    if (data.name) {
      const dup = await prisma.expenseCategory.findFirst({ where: { name: { equals: data.name, mode: "insensitive" }, NOT: { id } } });
      if (dup) throw new ValidationError({ name: "This category already exists" });
    }
    return prisma.expenseCategory.update({ where: { id }, data });
  },
};
