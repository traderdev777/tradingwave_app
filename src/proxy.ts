import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/token";

/**
 * Route protection (Next.js 16 "proxy", formerly middleware).
 * Fast check: the session cookie must carry a valid, unexpired signature.
 * The app layout then confirms the session still exists in the database.
 */
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const claims = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/app" || pathname.startsWith("/app/")) {
    if (!claims) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname + search);
      const res = NextResponse.redirect(url);
      if (req.cookies.has(SESSION_COOKIE)) res.cookies.delete(SESSION_COOKIE);
      return res;
    }
    const res = NextResponse.next();
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  }

  if ((pathname === "/login" || pathname === "/signup") && claims) {
    return NextResponse.redirect(new URL("/app", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app", "/app/:path*", "/login", "/signup"],
};
