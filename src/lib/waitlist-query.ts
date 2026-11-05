import type { Prisma } from "@prisma/client";

/**
 * Case-insensitive search across name, email, phone, broker, market.
 * SQLite's LIKE (used by `contains`) is already case-insensitive for ASCII; Postgres needs mode: "insensitive".
 * `mode` only exists in the Postgres client's types, hence the cast (the code compiles against either client).
 */
export function waitlistWhere(q: string, provider: "postgresql" | "sqlite" = currentProvider()): Prisma.WaitlistEntryWhereInput {
  const term = q.trim().slice(0, 100);
  if (!term) return {};
  const filters: Prisma.StringFilter[] =
    provider === "postgresql"
      ? [{ contains: term, mode: "insensitive" } as Prisma.StringFilter]
      : Array.from(new Set([term, term.toLowerCase()])).map((t) => ({ contains: t }));
  return {
    OR: filters.flatMap((f) => [{ name: f }, { email: f }, { phone: f }, { broker: f }, { market: f }]),
  };
}

function currentProvider(): "postgresql" | "sqlite" {
  return /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL ?? "") ? "postgresql" : "sqlite";
}
