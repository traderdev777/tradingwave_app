import { db } from "@/lib/db";
import { clientIp } from "@/lib/hash";
import { json, readJsonPost } from "@/lib/http";
import { burnPasswordCheck, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { fieldErrors, loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;

  const rl = rateLimit(`login:${clientIp(req.headers)}`, 10, 15 * 60 * 1000);
  if (!rl.ok) {
    return json(
      { ok: false, error: `Too many sign-in attempts. Please wait ${Math.ceil(rl.retryAfterSeconds / 60)} min and try again.` },
      429,
      { headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const result = loginSchema.safeParse(parsed.body);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const { email, password } = result.data;

  const user = await db.user.findUnique({ where: { email } });
  const valid = user ? await verifyPassword(password, user.passwordHash) : await burnPasswordCheck(password);
  if (!user || !valid) {
    return json({ ok: false, error: "That email and password don't match. Please try again." }, 401);
  }

  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  let role = user.role;
  if (adminEmail && email === adminEmail && role !== "ADMIN") {
    role = (await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } })).role;
  }

  // Housekeeping: clear this user's expired sessions.
  await db.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } });
  await createSession(user.id);
  return json({ ok: true, user: { name: user.name, email: user.email, role } });
}
