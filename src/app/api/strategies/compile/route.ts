import { json, readJsonPost } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentUser } from "@/lib/session";
import { compileStrategy } from "@/lib/strategy/compile";
import { lotSizes } from "@/lib/strategy/market";
import { compileBodySchema } from "@/lib/strategy/store";
import { fieldErrors } from "@/lib/validation";

export const runtime = "nodejs";

/** Plain language → draft Strategy DSL. Drafts only: nothing is saved or executed here. */
export async function POST(req: Request) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);

  const rl = rateLimit(`compile:${user.id}`, Number(process.env.COMPILE_RATE_LIMIT) || 20, 10 * 60 * 1000);
  if (!rl.ok) {
    return json({ ok: false, error: `You've drafted a lot of strategies in a short time. Try again in ${Math.ceil(rl.retryAfterSeconds / 60)} min.` }, 429, {
      headers: { "Retry-After": String(rl.retryAfterSeconds) },
    });
  }
  const body = compileBodySchema.safeParse(parsed.body);
  if (!body.success) {
    const fields = fieldErrors(body.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the description.", fields }, 422);
  }
  const result = await compileStrategy(body.data.text, { lotSizes: lotSizes() });
  return json({ ...result, ok: result.ok }, result.ok ? 200 : 422);
}
