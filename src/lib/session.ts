import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "./db";
import { clientIp, hashIp } from "./hash";
import { isHttpsRequest } from "./origin";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "./token";

export type CurrentUser = { id: string; email: string; name: string; role: string; createdAt: Date };

/** Create a DB session row and set the signed, httpOnly cookie. */
export async function createSession(userId: string) {
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await db.session.create({
    data: {
      userId,
      expiresAt,
      userAgent: h.get("user-agent")?.slice(0, 200) ?? null,
      ipHash: hashIp(clientIp(h)),
    },
  });
  const token = await signSessionToken({ sid: session.id, uid: userId });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    // Secure whenever the app is served over HTTPS; plain http://localhost still works.
    secure: isHttpsRequest(h),
    path: "/",
    expires: expiresAt,
  });
  return session;
}

export async function destroySession() {
  const jar = await cookies();
  const claims = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (claims) await db.session.deleteMany({ where: { id: claims.sid } });
  jar.delete(SESSION_COOKIE);
}

/** Validates the cookie signature AND that the session still exists in the DB. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const claims = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const session = await db.session.findUnique({
    where: { id: claims.sid },
    include: { user: { select: { id: true, email: true, name: true, role: true, createdAt: true } } },
  });
  if (!session || session.expiresAt < new Date() || session.userId !== claims.uid) return null;
  return session.user;
});

export async function getCurrentSessionId(): Promise<string | null> {
  const jar = await cookies();
  const claims = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  return claims?.sid ?? null;
}

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/app");
  return user;
}
