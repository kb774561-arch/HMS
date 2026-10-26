import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Removes all tenant and money records so the PG can start entering real data:
 * tenants, bed allocations/transfers, monthly rent, payments & receipts,
 * deposits, extra charges and expenditure.
 *
 * KEPT: users & passwords, roles, menus, permissions, settings, PG details,
 * rooms, beds (all become available), collection accounts, charge types and
 * expense categories.
 *
 *   npx tsx src/scripts/clearBusinessData.ts <ENV_VAR_WITH_URL> --confirm
 *
 * One transaction (DELETE only — no TRUNCATE/DROP); any error rolls back.
 */
const urlVar = process.argv[2];
if (!urlVar || !process.env[urlVar] || !process.argv.includes("--confirm")) {
  console.error("Usage: npx tsx src/scripts/clearBusinessData.ts <DATABASE_URL|SUPABASE_DATABASE_URL> --confirm   (take a backup first)");
  process.exit(1);
}

// Children before parents.
const TABLES = [
  "payment_allocations",
  "payment_receipts",
  "payment_reversals",
  "payments",
  "rent_invoice_items",
  "rent_invoices",
  "security_deposit_transactions",
  "additional_charges",
  "financial_adjustments",
  "bed_transfer_history",
  "bed_allocations",
  "bed_reservations",
  "tenant_rent_history",
  "tenant_contacts",
  "tenant_documents",
  "tenants",
  "expenses",
  "import_errors",
  "import_rows",
  "import_batches",
  "receipt_sequences",
];

const prisma = new PrismaClient({ datasources: { db: { url: process.env[urlVar]! } } });

async function main() {
  const removed = await prisma.$transaction(
    async (tx) => {
      const out: Record<string, number> = {};
      for (const t of TABLES) out[t] = await tx.$executeRawUnsafe(`DELETE FROM genius_pg."${t}"`);
      await tx.auditLog.create({ data: { action: "BUSINESS_DATA_CLEARED", entityType: "system", metadata: out } });
      return out;
    },
    { timeout: 120_000 },
  );
  console.table(Object.entries(removed).filter(([, n]) => n > 0).map(([table, rows]) => ({ table, rows })));
  const kept = await prisma.$queryRawUnsafe<Record<string, number>[]>(`select
    (select count(*)::int from genius_pg.users) users, (select count(*)::int from genius_pg.menus) menus,
    (select count(*)::int from genius_pg.rooms) rooms, (select count(*)::int from genius_pg.beds) beds,
    (select count(*)::int from genius_pg.collection_accounts) accounts, (select count(*)::int from genius_pg.charge_types) charge_types,
    (select count(*)::int from genius_pg.expense_categories) expense_categories`);
  console.log("✓ Cleared. Kept:", kept[0]);
}

main()
  .catch((e) => {
    console.error("✗ Nothing was deleted (rolled back):", e instanceof Error ? e.message.split("\n").pop() : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
