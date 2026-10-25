import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Copies every genius_pg table from Supabase (SUPABASE_DATABASE_URL) into the
 * database in DATABASE_URL, keeping IDs. Rows that already exist locally are
 * skipped (ON CONFLICT DO NOTHING), so it is safe to re-run. Supabase is only read.
 *
 *   npm run db:copy-supabase
 */
const TABLES = [
  "roles", "users", "menus", "role_permissions", "user_permission_overrides", "system_settings", "audit_logs",
  "pg_properties", "rooms", "beds", "collection_accounts", "charge_types",
  "tenants", "tenant_contacts", "tenant_documents", "tenant_rent_history", "bed_reservations", "bed_allocations",
  "rent_invoices", "rent_invoice_items", "payments", "payment_allocations", "payment_receipts", "payment_reversals",
  "financial_adjustments", "security_deposit_transactions", "additional_charges",
  "import_batches", "import_rows", "import_errors", "receipt_sequences",
];

export async function copyFromSupabase() {
  const sourceUrl = process.env.SUPABASE_DATABASE_URL;
  if (!sourceUrl) throw new Error("SUPABASE_DATABASE_URL is not set in backend/.env");

  const source = new PrismaClient({ datasources: { db: { url: sourceUrl } } });
  const target = new PrismaClient();
  try {
    const data: Record<string, unknown[]> = {};
    for (const table of TABLES) {
      const rows = await source.$queryRawUnsafe<{ rows: unknown[] | null }[]>(
        `SELECT json_agg(t) AS rows FROM genius_pg."${table}" t`,
      );
      data[table] = rows[0]?.rows ?? [];
    }

    await target.$transaction(
      async (tx) => {
        // Parent/child order is already right, but this also tolerates self-references (menus).
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
        for (const table of TABLES) {
          const rows = data[table]!;
          if (!rows.length) continue;
          const inserted = await tx.$executeRawUnsafe(
            `INSERT INTO genius_pg."${table}"
             SELECT * FROM json_populate_recordset(NULL::genius_pg."${table}", $1::json)
             ON CONFLICT DO NOTHING`,
            JSON.stringify(rows),
          );
          console.log(`  ${table.padEnd(30)} ${String(inserted).padStart(4)} of ${rows.length} copied`);
        }
      },
      { timeout: 120_000 },
    );
  } finally {
    await Promise.all([source.$disconnect(), target.$disconnect()]);
  }
}

if (process.argv[1]?.includes("copyFromSupabase")) {
  copyFromSupabase()
    .then(() => console.log("✓ Supabase data copied"))
    .catch((e) => {
      console.error("✗ Copy failed:", e instanceof Error ? e.message : e);
      process.exit(1);
    });
}
