import { PrismaClient } from "@prisma/client";

/** "postgresql" on Vercel/Neon (postgres:// URL), "sqlite" for local dev (file:./dev.db). */
export const dbProvider: "postgresql" | "sqlite" = /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "") ? "postgresql" : "sqlite";

// The Postgres schema declares directUrl = env("DATABASE_URL_UNPOOLED"). Neon's Vercel integration sets it;
// fall back to the legacy Vercel name or the pooled URL so the client never fails on a missing variable.
if (dbProvider === "postgresql" && !process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL_UNPOOLED = process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

// Reuse one client per warm instance (dev hot reload and serverless warm starts).
globalForPrisma.prisma = db;
