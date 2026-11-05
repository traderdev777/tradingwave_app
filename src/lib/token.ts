import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tw_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export type SessionClaims = { sid: string; uid: string };

export class SessionSecretError extends Error {
  constructor() {
    super(
      "SESSION_SECRET is missing or shorter than 32 characters. Run `npm run setup` locally, or on Vercel set it in " +
        "Settings → Environment Variables (generate with `openssl rand -base64 48`).",
    );
    this.name = "SessionSecretError";
  }
}

function key(secret: string | undefined): Uint8Array {
  if (!secret || secret.length < 32) throw new SessionSecretError();
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  claims: SessionClaims,
  secret = process.env.SESSION_SECRET,
  ttlSeconds = SESSION_TTL_SECONDS,
): Promise<string> {
  return new SignJWT({ uid: claims.uid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sid)
    .setIssuedAt()
    .setIssuer("tradingwave")
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(key(secret));
}

export async function verifySessionToken(
  token: string | undefined,
  secret = process.env.SESSION_SECRET,
): Promise<SessionClaims | null> {
  if (!token) return null;
  // A missing secret is a server misconfiguration, not a bad token: fail loudly instead of signing everyone out.
  const k = key(secret);
  try {
    const { payload } = await jwtVerify(token, k, { issuer: "tradingwave", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.uid !== "string") return null;
    return { sid: payload.sub, uid: payload.uid };
  } catch {
    return null;
  }
}
