import { describe, expect, it } from "vitest";
import {
  POSTGRES_SCHEMA,
  SQLITE_SCHEMA,
  isPostgresUrl,
  modelBlocks,
  pickSchema,
  readSchema,
  resolveDbEnv,
  toPostgresSchema,
} from "../scripts/prisma-schema.mjs";
import { assertServerConfig, configProblems } from "@/lib/config";
import { isHttpsRequest, isSameOrigin } from "@/lib/origin";
import { verifySessionToken } from "@/lib/token";
import { waitlistWhere } from "@/lib/waitlist-query";

const E = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
const SECRET = "test-secret-that-is-definitely-longer-than-32-chars";

describe("Prisma schemas (SQLite source of truth → generated Postgres)", () => {
  const sqlite = readSchema(SQLITE_SCHEMA);
  const pg = readSchema(POSTGRES_SCHEMA);
  it("generated Postgres schema is up to date (run `npm run db:pg-schema` if this fails)", () => {
    expect(pg).toBe(toPostgresSchema(sqlite));
  });
  it("model blocks are identical", () => {
    const a = modelBlocks(sqlite);
    expect(a.length).toBeGreaterThanOrEqual(6);
    expect(modelBlocks(pg)).toEqual(a);
  });
  it("datasources differ only as intended", () => {
    expect(sqlite).toMatch(/provider\s*=\s*"sqlite"/);
    expect(pg).toMatch(/provider\s*=\s*"postgresql"/);
    expect(pg).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
    expect(pg).toMatch(/directUrl\s*=\s*env\("DATABASE_URL_UNPOOLED"\)/);
    expect(pg).not.toMatch(/"sqlite"/);
  });
  it("rejects non-portable schema features", () => {
    const base = 'datasource db {\n  provider = "sqlite"\n  url = env("DATABASE_URL")\n}\n';
    expect(() => toPostgresSchema(base + "model A {\n id String @id @db.Text\n}")).toThrow(/@db/);
    expect(() => toPostgresSchema(base + "model A {\n id String @id\n j Json\n}")).toThrow(/Json/);
    expect(() => toPostgresSchema(base.replace("sqlite", "postgresql"))).toThrow(/sqlite/);
  });
});

describe("schema / env selection", () => {
  it("keeps SQLite locally, Postgres on Vercel or postgres URLs", () => {
    expect(pickSchema({ DATABASE_URL: "file:./dev.db" }, undefined)).toBe(SQLITE_SCHEMA);
    expect(pickSchema({}, "file:./dev.db")).toBe(SQLITE_SCHEMA);
    expect(pickSchema({}, undefined)).toBe(SQLITE_SCHEMA);
    expect(pickSchema({ VERCEL: "1" }, "file:./dev.db")).toBe(POSTGRES_SCHEMA);
    expect(pickSchema({ DATABASE_URL: "postgresql://u:p@h/db?sslmode=require" }, undefined)).toBe(POSTGRES_SCHEMA);
    expect(pickSchema({}, "postgres://u:p@h/db")).toBe(POSTGRES_SCHEMA);
    expect(pickSchema({ PRISMA_SCHEMA: "x.prisma", VERCEL: "1" }, undefined)).toBe("x.prisma");
  });
  it("detects postgres URLs", () => {
    expect(isPostgresUrl("postgres://a")).toBe(true);
    expect(isPostgresUrl('"postgresql://a"')).toBe(true);
    expect(isPostgresUrl("file:./dev.db")).toBe(false);
    expect(isPostgresUrl(undefined)).toBe(false);
  });
  it("fills the direct URL from Neon / legacy Vercel names", () => {
    expect(resolveDbEnv({ DATABASE_URL: "p", DATABASE_URL_UNPOOLED: "d" }).DATABASE_URL_UNPOOLED).toBe("d");
    expect(resolveDbEnv({ DATABASE_URL: "p", POSTGRES_URL_NON_POOLING: "n" }).DATABASE_URL_UNPOOLED).toBe("n");
    expect(resolveDbEnv({ DATABASE_URL: "p" }).DATABASE_URL_UNPOOLED).toBe("p");
    const legacy = resolveDbEnv({ POSTGRES_PRISMA_URL: "pp", POSTGRES_URL_NON_POOLING: "n" });
    expect(legacy.DATABASE_URL).toBe("pp");
    expect(legacy.DATABASE_URL_UNPOOLED).toBe("n");
  });
});

describe("production config", () => {
  it("requires SESSION_SECRET in production only", () => {
    expect(() => assertServerConfig(E({ NODE_ENV: "production" }))).toThrow(/SESSION_SECRET.*openssl rand -base64 48/s);
    expect(() => assertServerConfig(E({ NODE_ENV: "production", SESSION_SECRET: "short" }))).toThrow(/SESSION_SECRET/);
    expect(() => assertServerConfig(E({ NODE_ENV: "production", SESSION_SECRET: SECRET }))).not.toThrow();
    expect(() => assertServerConfig(E({ NODE_ENV: "development" }))).not.toThrow();
  });
  it("requires Postgres on Vercel", () => {
    const env = E({ NODE_ENV: "production", SESSION_SECRET: SECRET, VERCEL: "1", DATABASE_URL: "file:./dev.db" });
    expect(configProblems(env).join()).toMatch(/postgres/);
    expect(configProblems({ ...env, DATABASE_URL: "postgresql://u:p@h/db" })).toEqual([]);
  });
  it("verifying a cookie with no secret is a loud error, not a silent sign-out", async () => {
    await expect(verifySessionToken("some.token.value", "")).rejects.toThrow(/SESSION_SECRET/);
    expect(await verifySessionToken(undefined, "")).toBeNull();
  });
});

describe("Vercel request handling", () => {
  const h = (o: Record<string, string>) => new Headers(o);
  const noEnv = E({});
  it("accepts the forwarded host on production and preview URLs", () => {
    expect(isSameOrigin(h({ host: "tradingwave.vercel.app", "x-forwarded-host": "tradingwave.vercel.app", origin: "https://tradingwave.vercel.app" }), "", noEnv)).toBe(true);
    expect(isSameOrigin(h({ host: "tw-git-feat-x-dev.vercel.app", "x-forwarded-host": "tw-git-feat-x-dev.vercel.app", origin: "https://tw-git-feat-x-dev.vercel.app" }), "https://tradingwave.in", noEnv)).toBe(true);
    expect(isSameOrigin(h({ host: "tradingwave.in", "x-forwarded-host": "tradingwave.in", origin: "https://tradingwave.in" }), "", noEnv)).toBe(true);
  });
  it("accepts Vercel system URLs and still blocks other sites", () => {
    const env = E({ VERCEL_URL: "tw-abc123.vercel.app", VERCEL_PROJECT_PRODUCTION_URL: "tradingwave.in" });
    expect(isSameOrigin(h({ host: "internal", origin: "https://tw-abc123.vercel.app" }), "", env)).toBe(true);
    expect(isSameOrigin(h({ host: "internal", origin: "https://tradingwave.in" }), "", env)).toBe(true);
    expect(isSameOrigin(h({ host: "tradingwave.vercel.app", "x-forwarded-host": "tradingwave.vercel.app", origin: "https://evil.vercel.app" }), "", env)).toBe(false);
  });
  it("marks cookies Secure behind Vercel HTTPS but not on plain localhost", () => {
    expect(isHttpsRequest(h({ "x-forwarded-proto": "https" }), noEnv)).toBe(true);
    expect(isHttpsRequest(h({}), E({ VERCEL_ENV: "preview" }))).toBe(true);
    expect(isHttpsRequest(h({}), E({ VERCEL_ENV: "production" }))).toBe(true);
    expect(isHttpsRequest(h({ "x-forwarded-proto": "http" }), noEnv)).toBe(false);
    expect(isHttpsRequest(h({}), E({ APP_URL: "https://tradingwave.in" }))).toBe(true);
  });
});

describe("waitlist search", () => {
  it("is case-insensitive on Postgres via mode, unchanged on SQLite", () => {
    expect(JSON.stringify(waitlistWhere("Asha", "postgresql"))).toContain('"mode":"insensitive"');
    expect(JSON.stringify(waitlistWhere("Asha", "sqlite"))).not.toContain("mode");
    expect(JSON.stringify(waitlistWhere("Asha", "sqlite"))).toContain('"asha"');
    expect(waitlistWhere("  ", "postgresql")).toEqual({});
  });
});
