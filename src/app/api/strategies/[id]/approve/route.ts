import { db } from "@/lib/db";
import { json, readJsonPost } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { approveBodySchema, findOwned, serverValidate } from "@/lib/strategy/store";

export const runtime = "nodejs";

/** Approve the current draft version as-is (re-validated on the server). */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);
  const { id } = await ctx.params;
  const s = await findOwned(user.id, id);
  if (!s) return json({ ok: false, error: "Strategy not found." }, 404);
  if (s.status === "ARCHIVED") return json({ ok: false, error: "This strategy is archived. Restore it first." }, 409);
  const body = approveBodySchema.safeParse(parsed.body);
  if (!body.success) return json({ ok: false, error: "Please check the request." }, 422);
  if (!body.data.confirmPaper) return json({ ok: false, error: "Please confirm you understand this will only paper trade.", fields: { confirmPaper: "Required to approve." } }, 422);
  if (body.data.versionId !== s.currentVersionId) return json({ ok: false, error: "Only the latest version can be approved. Reload the page." }, 409);
  const ver = await db.strategyVersion.findFirst({ where: { id: body.data.versionId, strategyId: s.id } });
  if (!ver) return json({ ok: false, error: "Version not found." }, 404);
  if (ver.approvedAt) return json({ ok: true, alreadyApproved: true, version: ver.version, status: "APPROVED" });
  const { v, stored } = serverValidate(JSON.parse(ver.dsl));
  if (!v.ok) return json({ ok: false, error: "Fix the errors before approving.", validation: stored }, 422);
  await db.$transaction([
    db.strategyVersion.update({ where: { id: ver.id }, data: { approvedAt: new Date(), validation: JSON.stringify(stored) } }),
    db.strategy.update({ where: { id: s.id }, data: { status: "APPROVED" } }),
    db.strategyEvent.create({ data: { strategyId: s.id, userId: user.id, type: "approved", version: ver.version, detail: `Approved version ${ver.version} for paper trading` } }),
  ]);
  return json({ ok: true, version: ver.version, status: "APPROVED" });
}
