import "dotenv/config";
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";
import { copyFromSupabase } from "./copyFromSupabase.js";

/**
 * One-command local PostgreSQL setup:
 *   1. creates the database named in DATABASE_URL if it does not exist
 *   2. applies the Prisma migration (schema "genius_pg")
 *   3. fills an empty database: copies all data from Supabase when
 *      SUPABASE_DATABASE_URL is set, otherwise seeds the base data
 *   4. applies the flat 7-module menu + operator permissions
 * Safe to re-run: existing data is kept.
 *
 *   npm run db:setup
 */
async function ensureDatabase() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const dbName = decodeURIComponent(url.pathname.slice(1));
  if (!dbName || !/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Invalid database name in DATABASE_URL: "${dbName}"`);

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl.toString() } } });
  try {
    const rows = await admin.$queryRaw<{ exists: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS exists`;
    if (rows[0]?.exists) {
      console.log(`✓ Database "${dbName}" already exists`);
    } else {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`✓ Created database "${dbName}"`);
    }
  } finally {
    await admin.$disconnect();
  }
}

function run(cmd: string, label: string) {
  console.log(`→ ${label}`);
  execSync(cmd, { stdio: "inherit" });
}

async function main() {
  await ensureDatabase();
  run("npx prisma migrate deploy", "Applying migrations");
  const local = new PrismaClient();
  const users = await local.user.count().finally(() => local.$disconnect());
  if (users > 0) {
    console.log("✓ Data already present — nothing copied or seeded");
  } else if (process.env.SUPABASE_DATABASE_URL) {
    console.log("→ Copying data from Supabase");
    await copyFromSupabase();
  } else {
    run("npx tsx prisma/seed.ts", "Seeding base data");
  }
  run("npx tsx src/scripts/simplifyMenus.ts", "Applying menus and permissions");
  console.log("\n✓ Local database ready. Start the API with: npm run dev");
}

main().catch((e) => {
  console.error("\n✗ Setup failed:", e instanceof Error ? e.message : e);
  console.error("  Check DATABASE_URL in backend/.env (user, password, host, port).");
  process.exit(1);
});
