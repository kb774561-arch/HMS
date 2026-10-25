import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    const tables = await prisma.$queryRawUnsafe<
      { table_schema: string; table_name: string }[]
    >(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_schema IN ('public', 'genius_pg')
         AND table_type = 'BASE TABLE'
       ORDER BY table_schema, table_name`,
    );
    console.log(`Found ${tables.length} base tables in public/genius_pg:`);
    for (const t of tables) {
      console.log(`  ${t.table_schema}.${t.table_name}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
