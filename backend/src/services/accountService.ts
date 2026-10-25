import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

type AccountInput = {
  accountName: string;
  accountType?: string | null;
  accountHolder?: string | null;
  bankName?: string | null;
  accountReference?: string | null;
  upiId?: string | null;
  isActive?: boolean;
};

async function assertUniqueName(accountName: string, exceptId?: string) {
  const dup = await prisma.collectionAccount.findFirst({
    where: { accountName: { equals: accountName, mode: "insensitive" }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
  });
  if (dup) throw new ValidationError({ accountName: "An account with this name already exists" });
}

export const accountService = {
  async list() {
    const [accounts, usage] = await Promise.all([
      prisma.collectionAccount.findMany({ orderBy: { accountName: "asc" } }),
      prisma.payment.groupBy({ by: ["collectionAccountId"], where: { status: "RECORDED" }, _count: { _all: true } }),
    ]);
    const used = new Map(usage.map((u) => [u.collectionAccountId, u._count._all]));
    return accounts.map((a) => ({ ...a, paymentCount: used.get(a.id) ?? 0 }));
  },

  async create(data: AccountInput) {
    await assertUniqueName(data.accountName);
    return prisma.collectionAccount.create({ data });
  },

  async update(id: string, data: Partial<AccountInput>) {
    const existing = await prisma.collectionAccount.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Account not found");
    if (data.accountName) await assertUniqueName(data.accountName, id);
    return prisma.collectionAccount.update({ where: { id }, data });
  },
};
