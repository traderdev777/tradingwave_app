import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp } from "@/lib/hash";
import { json, readJsonPost } from "@/lib/http";
import { hashPassword } from "@/lib/password";
import { rateLimit } from "@/lib/rate-limit";
import { createSession } from "@/lib/session";
import { fieldErrors, signupSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;

  const rl = rateLimit(`signup:${clientIp(req.headers)}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return json({ ok: false, error: "Too many sign-up attempts. Please try again later." }, 429);

  const result = signupSchema.safeParse(parsed.body);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const { name, email, password } = result.data;
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const passwordHash = await hashPassword(password);

  try {
    const user = await db.$transaction(async (tx) => {
      const isFirst = (await tx.user.count()) === 0;
      const role = (adminEmail && email === adminEmail) || (!adminEmail && isFirst) ? "ADMIN" : "USER";
      return tx.user.create({ data: { name, email, passwordHash, role } });
    });
    await createSession(user.id);
    return json({ ok: true, user: { name: user.name, email: user.email, role: user.role } }, 201);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return json(
        { ok: false, error: "An account with this email already exists. Try signing in.", fields: { email: "An account with this email already exists." } },
        409,
      );
    }
    console.error("signup failed", err);
    return json({ ok: false, error: "Something went wrong on our side. Please try again." }, 500);
  }
}
