import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { SESSION_COOKIE } from "@/lib/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clears a cookie whose session no longer exists (signed out elsewhere, password changed), then goes to /login. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const next = url.searchParams.get("next");
  const target = new URL("/login", req.url);
  if (next && next.startsWith("/app")) target.searchParams.set("next", next);
  const res = NextResponse.redirect(target, 303);
  if (!(await getCurrentUser())) res.cookies.delete(SESSION_COOKIE);
  else return NextResponse.redirect(new URL("/app", req.url), 303);
  return res;
}
