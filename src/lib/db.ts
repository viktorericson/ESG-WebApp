import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Den lokale `prisma dev`-database (PGlite) tillader højst 10 forbindelser og lukker dem, der kommer ud over.
 * Sider der beregner mange selskaber parallelt (Promise.all) kan ellers ramme grænsen – især når next dev
 * kører flere processer. Med et mindre pool sættes ekstra forespørgsler i kø i stedet for at fejle.
 * Kan overstyres med DATABASE_POOL_MAX; i produktion bruges pg's standard (10), medmindre den er sat.
 */
const poolMax = process.env.DATABASE_POOL_MAX ? Number(process.env.DATABASE_POOL_MAX) : process.env.NODE_ENV === "production" ? undefined : 4;

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, max: poolMax, idleTimeoutMillis: 10_000 });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
