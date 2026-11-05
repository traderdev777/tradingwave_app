import { createHash } from "node:crypto";

/** One-way hash of an IP (salted with SESSION_SECRET) so we never store raw IPs. */
export function hashIp(ip: string, salt = process.env.SESSION_SECRET ?? ""): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "local";
}
