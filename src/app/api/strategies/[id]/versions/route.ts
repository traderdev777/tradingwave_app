import { db } from "@/lib/db";
import { json, readJsonPost } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { STRATEGY_BODY_LIMIT, appendVersion, currentVersion, findOwned, sameRules, serverValidate, versionBodySchema } from "@/lib/strategy/store";
import { fieldErrors } from "@/lib/validation";

export const runtime = "nodejs";

/** Any change to the rules creates a new version. Approved versions are never modified. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = await readJsonPost(req, STRATEGY_BODY_LIMIT);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  if (!rateLimit(`strategy-write:${user.id}`, 120, 10 * 60 * 1000).ok) return json({ ok: false, error: "Too many saves. Wait a few minutes." }, 429);
  const { id } = await ctx.params;
  const s = await findOwned(user.id, id);
  if (!s) return json({ ok: false, error: "Strategy not found." }, 404);
  if (s.status === "ARCHIVED") return json({ ok: false, error: "This strategy is archived. Restore it to edit." }, 409);

  const body = versionBodySchema.safeParse(parsed.body);
  if (!body.success) {
    const fields = fieldErrors(body.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const { name, sourceText, engine, dsl, approve, confirmPaper } = body.data;
  const { v, stored } = serverValidate(dsl);
  if (!v.strategy) return json({ ok: false, error: "These rules don't match the rule format.", validation: stored }, 422);
  if (approve && !v.ok) return json({ ok: false, error: "Fix the errors before approving.", validation: stored }, 422);
  if (approve && !confirmPaper) return json({ ok: false, error: "Please confirm you understand this will only paper trade.", fields: { confirmPaper: "Required to approve." } }, 422);

  const cur = await currentVersion(s.id, s.currentVersionId);
  const renamed = name && name !== s.name;
  if (cur && sameRules(v.strategy, cur.dsl) && (sourceText === undefined || sourceText === cur.sourceText)) {
    // Rules unchanged: no new version. Optionally rename and/or approve the current (draft) version.
    if (renamed) {
      await db.strategy.update({ where: { id: s.id }, data: { name } });
      await db.strategyEvent.create({ data: { strategyId: s.id, userId: user.id, type: "renamed", detail: `Renamed from "${s.name}" to "${name}"` } });
    }
    if (approve && !cur.approvedAt) {
      await db.$transaction([
        db.strategyVersion.update({ where: { id: cur.id }, data: { approvedAt: new Date(), validation: JSON.stringify(stored) } }),
        db.strategy.update({ where: { id: s.id }, data: { status: "APPROVED" } }),
        db.strategyEvent.create({ data: { strategyId: s.id, userId: user.id, type: "approved", version: cur.version, detail: `Approved version ${cur.version} for paper trading` } }),
      ]);
      return json({ ok: true, unchanged: true, versionId: cur.id, version: cur.version, status: "APPROVED", validation: stored });
    }
    return json({ ok: true, unchanged: true, versionId: cur.id, version: cur.version, status: s.status, validation: stored });
  }

  const version = await appendVersion({
    strategyId: s.id,
    userId: user.id,
    strategy: v.strategy,
    sourceText: sourceText ?? cur?.sourceText ?? "",
    engine: engine ?? "manual",
    validation: stored,
    approve,
    name: renamed ? name : undefined,
    eventDetail: cur ? `Saved version ${(cur.version ?? 0) + 1} (edited from version ${cur.version})` : undefined,
  });
  if (renamed) await db.strategyEvent.create({ data: { strategyId: s.id, userId: user.id, type: "renamed", detail: `Renamed from "${s.name}" to "${name}"` } });
  return json({ ok: true, versionId: version.id, version: version.version, status: approve ? "APPROVED" : "DRAFT", validation: stored }, 201);
}
