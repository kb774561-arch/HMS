import dotenv from "dotenv";
dotenv.config();

import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1 AS ok`;
    console.log("Database connectivity: OK (SSL/direct connection accepted)");

    const schemas = await prisma.$queryRawUnsafe<{ schema_name: string }[]>(
      `SELECT schema_name FROM information_schema.schemata
       WHERE schema_name NOT IN ('pg_catalog','information_schema')
       ORDER BY schema_name`,
    );
    console.log(
      "Schemas:",
      schemas.map((s) => s.schema_name).join(", "),
    );

    const tables = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'genius_pg'
       ORDER BY table_name`,
    );
    console.log(`genius_pg tables (${tables.length}):`, tables.map((t) => t.table_name).join(", ") || "(none yet)");

    const identity = await prisma.$queryRawUnsafe<{ current_database: string; current_user: string }[]>(
      `SELECT current_database(), current_user`,
    );
    console.log("Identity:", identity[0]);
    console.log("Connection test completed successfully. No secrets were printed.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Connection test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
