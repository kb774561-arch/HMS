import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pgPool?: pg.Pool;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Prisma");
  }

  // Reuse a single pool in long-lived Node; Workers may recreate the isolate often.
  const pool =
    globalForPrisma.pgPool ??
    new pg.Pool({
      connectionString,
      // Workers / serverless: keep the pool tiny; Hyperdrive (optional) pools further upstream.
      max: process.env.CF_WORKER === "1" ? 1 : 10,
      ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
