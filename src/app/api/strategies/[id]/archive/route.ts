import { db } from "@/lib/db";
import { json, readJsonPost } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { archiveBodySchema, currentVersion, findOwned } from "@/lib/strategy/store";

export const runtime = "nodejs";

/** Archive or restore. Versions are kept either way. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  const { id } = await ctx.params;
  const s = await findOwned(user.id, id);
  if (!s) return json({ ok: false, error: "Strategy not found." }, 404);
  const body = archiveBodySchema.safeParse(parsed.body);
  if (!body.success) return json({ ok: false, error: "Please check the request." }, 422);
  let status: string;
  if (body.data.archive) status = "ARCHIVED";
  else {
    const cur = await currentVersion(s.id, s.currentVersionId);
    status = cur?.approvedAt ? "APPROVED" : "DRAFT";
  }
  if (status === s.status) return json({ ok: true, status });
  await db.$transaction([
    db.strategy.update({ where: { id: s.id }, data: { status } }),
    db.strategyEvent.create({ data: { strategyId: s.id, userId: user.id, type: body.data.archive ? "archived" : "restored", detail: body.data.archive ? "Archived" : "Restored from archive" } }),
  ]);
  return json({ ok: true, status });
}
