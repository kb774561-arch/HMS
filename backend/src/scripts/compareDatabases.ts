import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Read-only row-level comparison of genius_pg between two databases, keyed by `id`.
 *   npx tsx src/scripts/compareDatabases.ts SOURCE_URL_VAR TARGET_URL_VAR
 * Prints per table: rows only in source, only in target, identical, and differing.
 */
const [srcVar = "DATABASE_URL", dstVar = "SUPABASE_DATABASE_URL"] = process.argv.slice(2);
const src = new PrismaClient({ datasources: { db: { url: process.env[srcVar]! } } });
const dst = new PrismaClient({ datasources: { db: { url: process.env[dstVar]! } } });

async function tables(db: PrismaClient) {
  const rows = await db.$queryRawUnsafe<{ t: string }[]>(
    `select table_name t from information_schema.tables
     where table_schema='genius_pg' and table_type='BASE TABLE' and table_name <> '_prisma_migrations' order by 1`,
  );
  return rows.map((r) => r.t);
}

/** id → md5 of the row, comparing only the columns both sides share. */
async function fingerprints(db: PrismaClient, table: string, columns: string[]) {
  const cols = columns.map((c) => `"${c}"`).join(", ");
  const rows = await db.$queryRawUnsafe<{ id: string; h: string }[]>(
    `select id::text id, md5(row(${cols})::text) h from genius_pg."${table}"`,
  );
  return new Map(rows.map((r) => [r.id, r.h]));
}

async function columnsOf(db: PrismaClient, table: string) {
  const rows = await db.$queryRawUnsafe<{ c: string }[]>(
    `select column_name c from information_schema.columns where table_schema='genius_pg' and table_name='${table}' order by ordinal_position`,
  );
  return rows.map((r) => r.c);
}

async function main() {
  const [srcTables, dstTables] = await Promise.all([tables(src), tables(dst)]);
  const result: Record<string, unknown>[] = [];
  for (const t of srcTables) {
    if (!dstTables.includes(t)) {
      const n = (await src.$queryRawUnsafe<{ n: number }[]>(`select count(*)::int n from genius_pg."${t}"`))[0]!.n;
      result.push({ table: t, status: "MISSING IN TARGET", source: n });
      continue;
    }
    const [sc, dc] = await Promise.all([columnsOf(src, t), columnsOf(dst, t)]);
    const shared = sc.filter((c) => dc.includes(c));
    const [a, b] = await Promise.all([fingerprints(src, t, shared), fingerprints(dst, t, shared)]);
    let onlySrc = 0, onlyDst = 0, same = 0, diff = 0;
    for (const [id, h] of a) {
      if (!b.has(id)) onlySrc++;
      else if (b.get(id) === h) same++;
      else diff++;
    }
    for (const id of b.keys()) if (!a.has(id)) onlyDst++;
    result.push({
      table: t,
      source: a.size,
      target: b.size,
      identical: same,
      differing: diff,
      onlyInSource: onlySrc,
      onlyInTarget: onlyDst,
      newColumns: sc.filter((c) => !dc.includes(c)).join(" ") || "",
    });
  }
  for (const t of dstTables) if (!srcTables.includes(t)) result.push({ table: t, status: "ONLY IN TARGET" });
  console.table(result);
}

main()
  .catch((e) => {
    console.error("Compare failed:", e instanceof Error ? e.message.split("\n").pop() : e);
    process.exitCode = 1;
  })
  .finally(() => Promise.all([src.$disconnect(), dst.$disconnect()]));
