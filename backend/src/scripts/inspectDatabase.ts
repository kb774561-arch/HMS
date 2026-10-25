import "dotenv/config";
import { PrismaClient } from "@prisma/client";

/**
 * Read-only inventory of the HMS application schema (genius_pg) plus Prisma history.
 *   npx tsx src/scripts/inspectDatabase.ts <ENV_VAR_WITH_URL> [--json]
 * Never prints connection strings or password hashes.
 */
const urlVar = process.argv[2] ?? "DATABASE_URL";
const url = process.env[urlVar];
if (!url) throw new Error(`${urlVar} is not set`);
const asJson = process.argv.includes("--json");
const prisma = new PrismaClient({ datasources: { db: { url } } });

const q = <T = Record<string, unknown>>(sql: string) => prisma.$queryRawUnsafe<T[]>(sql);

async function main() {
  const [db] = await q<{ db: string; version: string }>(`select current_database() db, split_part(version(), ' on ', 1) version`);
  const schemas = await q<{ schema_name: string }>(
    `select schema_name from information_schema.schemata
     where schema_name not like 'pg\\_%' and schema_name <> 'information_schema' order by 1`,
  );
  const tables = await q<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='genius_pg' and table_type='BASE TABLE' order by 1`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of tables) {
    counts[table_name] = (await q<{ n: number }>(`select count(*)::int n from genius_pg."${table_name}"`))[0]!.n;
  }
  const columns = await q<{ n: number }>(`select count(*)::int n from information_schema.columns where table_schema='genius_pg'`);
  const enums = await q<{ name: string; labels: string }>(
    `select t.typname name, string_agg(e.enumlabel, ',' order by e.enumsortorder) labels
     from pg_type t join pg_enum e on e.enumtypid=t.oid join pg_namespace n on n.oid=t.typnamespace
     where n.nspname='genius_pg' group by 1 order by 1`,
  );
  const constraints = await q<{ contype: string; n: number }>(
    `select c.contype::text, count(*)::int n from pg_constraint c join pg_namespace n on n.oid=c.connamespace
     where n.nspname='genius_pg' group by 1 order by 1`,
  );
  const indexes = await q<{ n: number }>(`select count(*)::int n from pg_indexes where schemaname='genius_pg'`);
  const partialIndexes = await q<{ indexname: string }>(`select indexname from pg_indexes where schemaname='genius_pg' and indexdef ilike '% where %'`);
  const sequences = await q<{ sequence_name: string }>(`select sequence_name from information_schema.sequences where sequence_schema='genius_pg'`);
  const functions = await q<{ proname: string }>(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='genius_pg'`,
  );
  const triggers = await q<{ tgname: string }>(
    `select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='genius_pg' and not t.tgisinternal`,
  );
  const migrations = await q<{ migration_name: string; finished: boolean; rolled_back: boolean }>(
    `select migration_name, finished_at is not null finished, rolled_back_at is not null rolled_back
     from public._prisma_migrations order by started_at`,
  ).catch(() => []);
  const users = await q<{ username: string; role: string; active: boolean; hash_ok: boolean }>(
    `select u.username, r.role_name role, u.is_active active, (u.password_hash like '$2%' and length(u.password_hash)=60) hash_ok
     from genius_pg.users u join genius_pg.roles r on r.id=u.role_id order by 1`,
  );
  const publicTables = await q<{ table_name: string }>(
    `select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by 1`,
  );
  const extensions = await q<{ extname: string }>(`select extname from pg_extension order by 1`);

  const report = {
    database: db!.db,
    version: db!.version,
    schemas: schemas.map((s) => s.schema_name),
    tableCount: tables.length,
    columnCount: columns[0]!.n,
    totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    enums,
    constraints: Object.fromEntries(constraints.map((c) => [c.contype, c.n])),
    indexCount: indexes[0]!.n,
    partialIndexes: partialIndexes.map((i) => i.indexname),
    sequences: sequences.map((s) => s.sequence_name),
    functions: functions.map((f) => f.proname),
    triggers: triggers.map((t) => t.tgname),
    prismaMigrations: migrations,
    users,
    publicTables: publicTables.map((t) => t.table_name),
    extensions: extensions.map((e) => e.extname),
  };

  if (asJson) {
    console.log(JSON.stringify(report));
    return;
  }
  console.log(`${report.database} — ${report.version}`);
  console.log(`genius_pg: ${report.tableCount} tables, ${report.columnCount} columns, ${report.totalRows} rows, ${report.indexCount} indexes`);
  console.log(`constraints (p=PK f=FK u=unique c=check):`, report.constraints);
  console.log(`enums: ${report.enums.map((e) => e.name).join(", ")}`);
  console.log(`sequences: ${report.sequences.join(", ") || "none"} | functions: ${report.functions.join(", ") || "none"} | triggers: ${report.triggers.join(", ") || "none"}`);
  console.log(`partial indexes: ${report.partialIndexes.join(", ")}`);
  console.log(`prisma migrations:`, report.prismaMigrations.map((m) => `${m.migration_name}${m.finished ? "" : " (UNFINISHED)"}`));
  console.log(`users:`, report.users.map((u) => `${u.username} [${u.role}${u.active ? "" : ", inactive"}${u.hash_ok ? ", bcrypt ok" : ", BAD HASH"}]`).join("; "));
  console.log(`public tables: ${report.publicTables.join(", ") || "none"}`);
  console.log(`row counts:`, report.counts);
}

main()
  .catch((e) => {
    console.error("Inspection failed:", e instanceof Error ? e.message.split("\n").pop() : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
