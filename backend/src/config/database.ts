import { AsyncLocalStorage } from "node:async_hooks";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import pg from "pg";

type ClientWithPool = PrismaClient & { __ggpgPool?: pg.Pool };

const prismaAls = new AsyncLocalStorage<PrismaClient>();
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Prisma");
  }

  const pool = new pg.Pool({
    connectionString,
    // Workers: one connection per request-scoped client. Node: small pool is fine.
    max: process.env.CF_WORKER === "1" ? 1 : 10,
    ssl: connectionString.includes("localhost") ? undefined : { rejectUnauthorized: false },
  });

  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  }) as ClientWithPool;
  client.__ggpgPool = pool;
  return client;
}

function getClient(): PrismaClient {
  const scoped = prismaAls.getStore();
  if (scoped) return scoped;

  // Long-lived Node / Vercel: singleton. Workers should always hit ALS via middleware.
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/** Drop-in Prisma client — request-scoped on Cloudflare Workers, singleton elsewhere. */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    const value = client[prop];
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(client) : value;
  },
});

export function runWithRequestPrisma(client: PrismaClient, next: () => void): void {
  prismaAls.run(client, next);
}

export async function disposePrisma(client: PrismaClient): Promise<void> {
  try {
    await client.$disconnect();
  } finally {
    const pool = (client as ClientWithPool).__ggpgPool;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
