import { describe, expect, it } from "vitest";
import { burnPasswordCheck, hashPassword, verifyPassword } from "@/lib/password";
import { signSessionToken, verifySessionToken } from "@/lib/token";
import { isSameOrigin } from "@/lib/origin";
import { rateLimit, resetRateLimits } from "@/lib/rate-limit";
import { csvCell, formatIst, toCsv } from "@/lib/csv";
import { hashIp } from "@/lib/hash";

const SECRET = "test-secret-that-is-definitely-longer-than-32-chars";

describe("password hashing", () => {
  it("hashes with bcrypt and verifies only the right password", async () => {
    const hash = await hashPassword("nifty-wave-2026");
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword("nifty-wave-2026", hash)).toBe(true);
    expect(await verifyPassword("nifty-wave-2027", hash)).toBe(false);
  });
  it("burnPasswordCheck always fails", async () => {
    expect(await burnPasswordCheck("anything")).toBe(false);
  });
});

describe("session tokens", () => {
  it("round-trips session id and user id", async () => {
    const t = await signSessionToken({ sid: "s1", uid: "u1" }, SECRET);
    expect(await verifySessionToken(t, SECRET)).toEqual({ sid: "s1", uid: "u1" });
  });
  it("rejects tampered, wrong-secret, expired and missing tokens", async () => {
    const t = await signSessionToken({ sid: "s1", uid: "u1" }, SECRET);
    const parts = t.split(".");
    const tampered = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: "s2", uid: "u1", iss: "tradingwave" })).toString("base64url")}.${parts[2]}`;
    expect(await verifySessionToken(tampered, SECRET)).toBeNull();
    expect(await verifySessionToken(t, SECRET + "x")).toBeNull();
    const expired = await signSessionToken({ sid: "s1", uid: "u1" }, SECRET, -10);
    expect(await verifySessionToken(expired, SECRET)).toBeNull();
    expect(await verifySessionToken(undefined, SECRET)).toBeNull();
  });
  it("refuses to sign with a short secret", async () => {
    await expect(signSessionToken({ sid: "s", uid: "u" }, "short")).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("origin check", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  it("allows same host", () => {
    expect(isSameOrigin(h({ host: "localhost:3000", origin: "http://localhost:3000" }), "")).toBe(true);
  });
  it("allows APP_URL host", () => {
    expect(isSameOrigin(h({ host: "internal:3000", origin: "https://app.tradingwave.in" }), "https://app.tradingwave.in")).toBe(true);
  });
  it("falls back to Referer", () => {
    expect(isSameOrigin(h({ host: "localhost:3000", referer: "http://localhost:3000/login" }), "")).toBe(true);
  });
  it("blocks cross-site and missing origin", () => {
    expect(isSameOrigin(h({ host: "localhost:3000", origin: "https://evil.example" }), "")).toBe(false);
    expect(isSameOrigin(h({ host: "localhost:3000" }), "")).toBe(false);
    expect(isSameOrigin(h({ host: "localhost:3000", origin: "null" }), "")).toBe(false);
  });
});

describe("rate limit", () => {
  it("blocks after the limit and frees up after the window", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, 1000, t0 + i).ok).toBe(true);
    const blocked = rateLimit("k", 3, 1000, t0 + 10);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(rateLimit("k", 3, 1000, t0 + 1500).ok).toBe(true);
    expect(rateLimit("other", 3, 1000, t0 + 10).ok).toBe(true);
  });
});

describe("csv + ip hash", () => {
  it("escapes quotes/commas and neutralises formulas but keeps phone numbers", () => {
    expect(csvCell('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+919876543210")).toBe("+919876543210");
    expect(csvCell(null)).toBe("");
    expect(toCsv(["a", "b"], [[1, "x"]])).toBe("a,b\r\n1,x\r\n");
    expect(formatIst(new Date(Date.UTC(2026, 10, 5, 18, 55, 0)))).toBe("2026-11-06 00:25:00 IST");
  });
  it("hashes IPs deterministically without exposing them", () => {
    const a = hashIp("1.2.3.4", "salt");
    expect(a).toHaveLength(32);
    expect(a).toBe(hashIp("1.2.3.4", "salt"));
    expect(a).not.toContain("1.2.3.4");
    expect(a).not.toBe(hashIp("1.2.3.4", "other"));
  });
});
