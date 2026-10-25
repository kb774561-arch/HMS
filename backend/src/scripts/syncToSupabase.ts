import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Make Supabase genius_pg an exact copy of the local genius_pg data, keyed by id.
 * Run AFTER `prisma migrate deploy` has brought the Supabase schema up to date.
 *
 *   npx tsx src/scripts/syncToSupabase.ts                 → dry run (default, read-only)
 *   npx tsx src/scripts/syncToSupabase.ts --execute       → apply in ONE transaction
 *   … --keep-supabase-passwords                           → keep Supabase users' password hashes
 *
 * Steps inside the transaction:
 *   1. delete rows that exist only in Supabase (children first) — the old test data
 *   2. upsert every local row (parents first): insert new, update changed, keep ids
 * No DROP / TRUNCATE; no schema changes; local database is only read.
 */
const SOURCE = process.env.DATABASE_URL!;
const TARGET = process.env.SUPABASE_DATABASE_URL!;
const execute = process.argv.includes("--execute");
const keepTargetPasswords = process.argv.includes("--keep-supabase-passwords");

// Parents before children (FK-safe insert order). Delete order is the reverse.
const ORDER = [
  "roles", "users", "menus", "role_permissions", "user_permission_overrides", "sessions", "system_settings",
  "pg_properties", "rooms", "beds", "collection_accounts", "charge_types", "expense_categories",
  "tenants", "tenant_contacts", "tenant_documents", "tenant_rent_history", "bed_reservations", "bed_allocations",
  "bed_transfer_history", "rent_invoices", "rent_invoice_items", "payments", "payment_allocations",
  "payment_receipts", "payment_reversals", "financial_adjustments", "security_deposit_transactions",
  "additional_charges", "expenses", "import_batches", "import_rows", "import_errors", "receipt_sequences", "audit_logs",
];

const src = new PrismaClient({ datasources: { db: { url: SOURCE } } });
const dst = new PrismaClient({ datasources: { db: { url: TARGET } } });

async function columns(db: PrismaClient, table: string) {
  const rows = await db.$queryRawUnsafe<{ c: string }[]>(
    `select column_name c from information_schema.columns where table_schema='genius_pg' and table_name=$1 order by ordinal_position`,
    table,
  );
  return rows.map((r) => r.c);
}

async function main() {
  // Every application table must be covered, and both schemas must match.
  const all = (
    await src.$queryRawUnsafe<{ t: string }[]>(
      `select table_name t from information_schema.tables where table_schema='genius_pg' and table_type='BASE TABLE' and table_name<>'_prisma_migrations'`,
    )
  ).map((r) => r.t);
  const missing = all.filter((t) => !ORDER.includes(t));
  if (missing.length) throw new Error(`Tables not in sync order: ${missing.join(", ")}`);
  const pending: string[] = [];
  for (const t of ORDER) {
    const [a, b] = await Promise.all([columns(src, t), columns(dst, t)]);
    if (a.join() !== b.join()) pending.push(t);
  }
  if (pending.length) {
    if (execute) throw new Error(`Schema differs on ${pending.join(", ")} — run prisma migrate deploy on Supabase first`);
    console.log(`Schema not yet migrated on Supabase for: ${pending.join(", ")} (expected before migrate deploy)
`);
  }

  const data: Record<string, Record<string, unknown>[]> = {};
  for (const t of ORDER) {
    const r = await src.$queryRawUnsafe<{ rows: Record<string, unknown>[] | null }[]>(`select json_agg(x) rows from genius_pg."${t}" x`);
    data[t] = r[0]?.rows ?? [];
  }

  const plan: { table: string; deleteOnlyInSupabase: number; upsertFromLocal: number }[] = [];
  for (const t of ORDER) {
    const ids = data[t]!.map((r) => String(r.id));
    const extra = await dst
      .$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from genius_pg."${t}" where not (id::text = any($1::text[]))`, ids)
      .catch(() => [{ n: 0 }]); // table created by the pending migration
    plan.push({ table: t, deleteOnlyInSupabase: extra[0]!.n, upsertFromLocal: ids.length });
  }
  console.table(plan.filter((p) => p.deleteOnlyInSupabase || p.upsertFromLocal));

  if (!execute) {
    console.log("\nDRY RUN — nothing changed. Re-run with --execute to apply.");
    return;
  }

  await dst.$transaction(
    async (tx) => {
      for (const t of [...ORDER].reverse()) {
        const ids = data[t]!.map((r) => String(r.id));
        await tx.$executeRawUnsafe(`delete from genius_pg."${t}" where not (id::text = any($1::text[]))`, ids);
      }
      for (const t of ORDER) {
        const rows = t === "menus"
          ? [...data[t]!].sort((a, b) => Number(a.parent_menu_id != null) - Number(b.parent_menu_id != null))
          : data[t]!;
        if (!rows.length) continue;
        const cols = await columns(tx as unknown as PrismaClient, t);
        const updatable = cols.filter((c) => c !== "id" && !(t === "users" && keepTargetPasswords && (c === "password_hash" || c === "must_change_password")));
        const setList = updatable.map((c) => `"${c}" = excluded."${c}"`).join(", ");
        await tx.$executeRawUnsafe(
          `insert into genius_pg."${t}" select * from json_populate_recordset(null::genius_pg."${t}", $1::json)
           on conflict (id) do update set ${setList}`,
          JSON.stringify(rows),
        );
      }
    },
    { timeout: 180_000, maxWait: 30_000 },
  );
  console.log("\n✓ Sync committed.");
}

main()
  .catch((e) => {
    console.error("✗ Sync failed — Supabase unchanged (transaction rolled back):", e instanceof Error ? e.message.split("\n").pop() : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([src.$disconnect(), dst.$disconnect()]));
