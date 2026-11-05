import { db } from "@/lib/db";
import { json, readJsonPost } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { fieldErrors, profileSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "Please sign in again." }, 401);

  const result = profileSchema.safeParse(parsed.body);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const updated = await db.user.update({ where: { id: user.id }, data: { name: result.data.name } });
  return json({ ok: true, message: "Name updated.", user: { name: updated.name } });
}
