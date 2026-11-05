import { db } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { getCurrentUser } from "@/lib/session";
import { waitlistWhere } from "@/lib/waitlist-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Please sign in.", { status: 401 });
  if (user.role !== "ADMIN") return new Response("Admins only.", { status: 403 });

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const rows = await db.waitlistEntry.findMany({ where: waitlistWhere(q), orderBy: { createdAt: "desc" } });
  const csv = toCsv(
    ["joined_ist", "name", "email", "phone", "broker", "market", "source"],
    rows.map((r) => [r.createdAt, r.name, r.email, r.phone, r.broker, r.market, r.source]),
  );
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tradingwave-waitlist-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
