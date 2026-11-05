import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { clientIp, hashIp } from "@/lib/hash";
import { json, readJsonPost } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { fieldErrors, waitlistSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readJsonPost(req);
  if ("response" in parsed) return parsed.response;

  const ip = clientIp(req.headers);
  const rl = rateLimit(`waitlist:${ip}`, 5, 10 * 60 * 1000);
  if (!rl.ok) {
    return json(
      { ok: false, error: "Too many attempts from your network. Please try again in a few minutes." },
      429,
      { headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  const result = waitlistSchema.safeParse(parsed.body);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    return json({ ok: false, error: Object.values(fields)[0] ?? "Please check the form.", fields }, 422);
  }
  const data = result.data;

  // Honeypot filled: pretend success, store nothing.
  if (data.botcheck !== undefined && data.botcheck !== false && data.botcheck !== "" && data.botcheck !== null) {
    return json({ ok: true, message: "You're on the list. We'll be in touch soon." });
  }

  try {
    await db.waitlistEntry.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        broker: data.broker ?? null,
        market: data.market ?? null,
        source: data.source ?? "landing",
        ipHash: hashIp(ip),
        userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return json({ ok: true, duplicate: true, message: "You're already on the list with this email. We'll be in touch." });
    }
    console.error("waitlist insert failed", err);
    return json({ ok: false, error: "Something went wrong on our side. Please try again in a minute." }, 500);
  }

  return json({ ok: true, message: "You're on the list. We'll be in touch soon." }, 201);
}
