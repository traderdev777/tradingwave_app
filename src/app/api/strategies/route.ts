import { db } from "@/lib/db";
import { json, readJsonPost } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { STRATEGY_BODY_LIMIT, appendVersion, createBodySchema, serverValidate } from "@/lib/strategy/store";
import { fieldErrors } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  const rows = await db.strategy.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 200 });
  return json({ ok: true, strategies: rows.map((r) => ({ id: r.id, name: r.name, status: r.status, updatedAt: r.updatedAt })) });
}

/** Save a new strategy (version 1), optionally approving it. */
export async function POST(req: Request) {
  const parsed = await readJsonPost(req, STRATEGY_BODY_LIMIT);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  if (!rateLimit(`strategy-write:${user.id}`, 120, 10 * 60 * 1000).ok) return json({ ok: false, error: "Too many saves. Wait a few minutes." }, 429);

  const body = createBodySchema.safeParse(parsed.body);
  if (!body.success) {
    const fields = fieldErrors(body.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const { name, sourceText, engine, dsl, approve, confirmPaper, editedAfterDraft } = body.data;
  const { v, stored } = serverValidate(dsl);
  if (!v.strategy) return json({ ok: false, error: "These rules don't match the rule format.", validation: stored }, 422);
  if (approve && !v.ok) return json({ ok: false, error: "Fix the errors before approving.", validation: stored }, 422);
  if (approve && !confirmPaper) return json({ ok: false, error: "Please confirm you understand this will only paper trade.", fields: { confirmPaper: "Required to approve." } }, 422);

  const count = await db.strategy.count({ where: { userId: user.id } });
  if (count >= 500) return json({ ok: false, error: "You've reached the 500-strategy limit. Archive or delete some first." }, 409);

  const strategy = await db.strategy.create({ data: { userId: user.id, name, status: "DRAFT" } });
  await db.strategyEvent.create({ data: { strategyId: strategy.id, userId: user.id, type: "created", detail: `Created from a ${engine === "gemini" ? "Gemini" : engine === "rules" ? "rules-engine" : "manual"} draft${editedAfterDraft ? ", edited before saving" : ""}` } });
  const version = await appendVersion({ strategyId: strategy.id, userId: user.id, strategy: v.strategy, sourceText, engine, validation: stored, approve });
  return json({ ok: true, id: strategy.id, versionId: version.id, version: version.version, status: approve ? "APPROVED" : "DRAFT", validation: stored }, 201);
}
