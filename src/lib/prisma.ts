import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { getServerEnv } from "@/lib/env";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

function createPrisma(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getServerEnv().DATABASE_URL,
    // Small per-instance pool: serverless instances multiply, so the database pooler does the real pooling.
    max: 2,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  });
  return new PrismaClient({ adapter });
}

let instance: PrismaClient | undefined;

/** Lazy so that importing this module (for example during `next build`) never needs a database. */
export function getPrisma(): PrismaClient {
  if (process.env.NODE_ENV === "development") {
    // Survive hot reloads instead of leaking a new pool on every edit.
    return (globalForPrisma.prisma ??= createPrisma());
  }
  return (instance ??= createPrisma());
}
