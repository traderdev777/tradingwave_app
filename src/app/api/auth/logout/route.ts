import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/origin";
import { destroySession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) {
    return NextResponse.json({ ok: false, error: "This request came from an unexpected origin." }, { status: 403 });
  }
  await destroySession();
  // Form posts get redirected home; fetch callers get JSON.
  if ((req.headers.get("accept") ?? "").includes("text/html")) {
    return NextResponse.redirect(new URL("/", req.url), 303);
  }
  return NextResponse.json({ ok: true });
}
