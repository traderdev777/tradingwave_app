import { db } from "@/lib/db";
import { clientIp } from "@/lib/hash";
import { json, readJsonPost } from "@/lib/http";
import { hashPassword, verifyPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { getCurrentSessionId, getCurrentUser } from "@/lib/session";
import { changePasswordSchema, fieldErrors } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);

  const rl = rateLimit(`pwchange:${user.id}:${clientIp(req.headers)}`, 8, 15 * 60 * 1000);
  if (!rl.ok) return json({ ok: false, error: "Too many attempts. Please wait a few minutes." }, 429);

  const result = changePasswordSchema.safeParse(parsed.body);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const record = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(result.data.currentPassword, record.passwordHash))) {
    return json(
      { ok: false, error: "Your current password isn't right.", fields: { currentPassword: "Your current password isn't right." } },
      400,
    );
  }
  const passwordHash = await hashPassword(result.data.newPassword);
  const sid = await getCurrentSessionId();
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } }),
    // Sign out every other device.
    db.session.deleteMany({ where: { userId: user.id, NOT: { id: sid ?? "" } } }),
  ]);
  return json({ ok: true, message: "Password changed. Other devices have been signed out." });
}
