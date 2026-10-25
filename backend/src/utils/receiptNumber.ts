import type { Prisma } from "@prisma/client";

/**
 * Receipt number GGP-YYMMDD-0001. Runs on the caller's transaction so the
 * sequence row lock and the payment commit (or roll back) together.
 */
export async function nextReceiptNumber(tx: Prisma.TransactionClient, date: Date): Promise<string> {
  const yy = String(date.getUTCFullYear()).slice(-2);
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const dateKey = `${yy}${mm}${dd}`;

  const row = await tx.receiptSequence.upsert({
    where: { dateKey },
    create: { dateKey, lastSeq: 1 },
    update: { lastSeq: { increment: 1 } },
  });

  return `GGP-${dateKey}-${String(row.lastSeq).padStart(4, "0")}`;
}
