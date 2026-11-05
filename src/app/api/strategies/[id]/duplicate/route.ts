import { db } from "@/lib/db";
import { json, readJsonPost } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { appendVersion, currentVersion, findOwned, serverValidate } from "@/lib/strategy/store";

export const runtime = "nodejs";

/** Copy the current version into a brand-new draft strategy. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  const { id } = await ctx.params;
  const s = await findOwned(user.id, id);
  if (!s) return json({ ok: false, error: "Strategy not found." }, 404);
  const cur = await currentVersion(s.id, s.currentVersionId);
  if (!cur) return json({ ok: false, error: "Nothing to duplicate yet." }, 409);
  const { v, stored } = serverValidate(JSON.parse(cur.dsl));
  if (!v.strategy) return json({ ok: false, error: "The current version no longer matches the rule format." }, 422);
  const name = `${s.name} (copy)`.slice(0, 80);
  const copy = await db.strategy.create({ data: { userId: user.id, name, status: "DRAFT" } });
  await db.strategyEvent.create({ data: { strategyId: copy.id, userId: user.id, type: "duplicated_from", detail: `Duplicated from "${s.name}" version ${cur.version}` } });
  await appendVersion({ strategyId: copy.id, userId: user.id, strategy: v.strategy, sourceText: cur.sourceText, engine: cur.engine as "gemini" | "rules" | "manual", validation: stored, approve: false });
  return json({ ok: true, id: copy.id }, 201);
}
