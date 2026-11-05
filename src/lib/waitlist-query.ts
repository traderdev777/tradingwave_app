import type { Prisma } from "@prisma/client";

/** Case-insensitive-ish search across name, email, phone, broker, market. Works on SQLite and Postgres. */
export function waitlistWhere(q: string): Prisma.WaitlistEntryWhereInput {
  const term = q.trim().slice(0, 100);
  if (!term) return {};
  const variants = Array.from(new Set([term, term.toLowerCase()]));
  return {
    OR: variants.flatMap((t) => [
      { name: { contains: t } },
      { email: { contains: t } },
      { phone: { contains: t } },
      { broker: { contains: t } },
      { market: { contains: t } },
    ]),
  };
}
