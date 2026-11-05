import { db } from "@/lib/db";
import { json } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { findOwned } from "@/lib/strategy/store";

export const runtime = "nodejs";

/** Read one strategy with its versions and audit trail (owner only). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  const { id } = await ctx.params;
  const s = await findOwned(user.id, id);
  if (!s) return json({ ok: false, error: "Strategy not found." }, 404);
  const [versions, events] = await Promise.all([
    db.strategyVersion.findMany({ where: { strategyId: s.id }, orderBy: { version: "desc" } }),
    db.strategyEvent.findMany({ where: { strategyId: s.id }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return json({
    ok: true,
    strategy: { id: s.id, name: s.name, status: s.status, currentVersionId: s.currentVersionId, createdAt: s.createdAt, updatedAt: s.updatedAt },
    versions: versions.map((v) => ({ ...v, dsl: JSON.parse(v.dsl), validation: JSON.parse(v.validation) })),
    events,
  });
}
