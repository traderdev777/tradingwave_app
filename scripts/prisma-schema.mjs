// Prisma schema helpers shared by postinstall, vercel-build and the tests.
//
//   node scripts/prisma-schema.mjs write   regenerate prisma/postgres/schema.prisma from prisma/schema.prisma
//   node scripts/prisma-schema.mjs check   exit 1 if the generated Postgres schema is out of date
//   node scripts/prisma-schema.mjs which   print the schema path this environment should use
//
// prisma/schema.prisma (SQLite, local dev) is the single source of truth. The Postgres schema
// is identical except for the datasource block (provider postgresql + pooled url + direct url).
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SQLITE_SCHEMA = "prisma/schema.prisma";
export const POSTGRES_SCHEMA = "prisma/postgres/schema.prisma";

const HEADER = `// GENERATED FILE: do not edit. Source of truth is prisma/schema.prisma.
// Regenerate with \`npm run db:pg-schema\`. Used on Vercel (Neon Postgres):
//   DATABASE_URL           pooled connection, used by the app at runtime
//   DATABASE_URL_UNPOOLED  direct connection, used by \`prisma db push\` / migrations
// scripts/prisma-schema.mjs fills DATABASE_URL_UNPOOLED from POSTGRES_URL_NON_POOLING or DATABASE_URL when absent.
`;

const PG_DATASOURCE = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}`;

/** Build the Postgres schema text from the SQLite schema text. Throws on anything non-portable. */
export function toPostgresSchema(sqliteText) {
  const ds = /datasource\s+db\s*\{[^}]*\}/m;
  const block = sqliteText.match(ds);
  if (!block) throw new Error("prisma/schema.prisma has no `datasource db { ... }` block");
  if (!/provider\s*=\s*"sqlite"/.test(block[0])) throw new Error('prisma/schema.prisma datasource must use provider = "sqlite"');
  const code = sqliteText.replace(/\/\/.*$/gm, "");
  if (/@db\./.test(code)) throw new Error("Native @db.* types are not portable between SQLite and Postgres; remove them from prisma/schema.prisma");
  if (/\bJson\b|\benum\s+\w+\s*\{/.test(code)) {
    // Both work on Postgres but behave differently on SQLite; keep the models portable on purpose.
    throw new Error("Json fields / enums are not used on purpose (SQLite parity). Store JSON as String.");
  }
  // Drop the leading comment block of the source file; the generated file gets its own header.
  const body = sqliteText.replace(/^(?:\s*\/\/.*\n)+\s*/, "").replace(ds, PG_DATASOURCE);
  return `${HEADER}\n${body.trimEnd()}\n`;
}

/** Model/enum blocks only (normalised whitespace), to compare two schemas independent of datasource. */
export function modelBlocks(text) {
  const noComments = text.replace(/\/\/.*$/gm, "");
  const blocks = noComments.match(/^(model|enum)\s+\w+\s*\{[^}]*\}/gm) ?? [];
  return blocks.map((b) => b.split("\n").map((l) => l.trim().replace(/\s+/g, " ")).filter(Boolean).join("\n"));
}

export function readSchema(rel) {
  return readFileSync(path.join(root, rel), "utf8");
}

/** True when the URL points at Postgres. */
export function isPostgresUrl(url) {
  return /^postgres(ql)?:\/\//i.test((url ?? "").trim().replace(/^"|"$/g, ""));
}

/**
 * Which schema to use. Postgres when PRISMA_SCHEMA says so, when DATABASE_URL is a postgres:// URL,
 * or when building on Vercel (VERCEL=1). Otherwise the SQLite schema (local dev, unchanged).
 */
export function pickSchema(env = process.env, dotenvUrl = readDotenvDatabaseUrl()) {
  if (env.PRISMA_SCHEMA) return env.PRISMA_SCHEMA;
  if (env.VERCEL === "1" || isPostgresUrl(env.DATABASE_URL ?? dotenvUrl)) return POSTGRES_SCHEMA;
  return SQLITE_SCHEMA;
}

/** DATABASE_URL from ./.env (Prisma reads .env itself, so honour it the same way). */
export function readDotenvDatabaseUrl() {
  const p = path.join(root, ".env");
  if (!existsSync(p)) return undefined;
  const m = readFileSync(p, "utf8").match(/^\s*DATABASE_URL\s*=\s*(.*)$/m);
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

/**
 * Normalise database env for Prisma on Postgres. Neon's Vercel integration sets DATABASE_URL (pooled)
 * and DATABASE_URL_UNPOOLED (direct); older Vercel Postgres templates use POSTGRES_PRISMA_URL /
 * POSTGRES_URL and POSTGRES_URL_NON_POOLING. Returns a copy of env with DATABASE_URL and
 * DATABASE_URL_UNPOOLED filled in when they can be derived.
 */
export function resolveDbEnv(env = process.env) {
  const out = { ...env };
  if (!out.DATABASE_URL) out.DATABASE_URL = env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || "";
  if (!out.DATABASE_URL_UNPOOLED) {
    out.DATABASE_URL_UNPOOLED = env.POSTGRES_URL_NON_POOLING || out.DATABASE_URL || "";
  }
  return out;
}

function main() {
  const cmd = process.argv[2];
  if (cmd === "which") {
    console.log(pickSchema());
    return;
  }
  const expected = toPostgresSchema(readSchema(SQLITE_SCHEMA));
  const target = path.join(root, POSTGRES_SCHEMA);
  if (cmd === "write") {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, expected);
    console.log(`✔ Wrote ${POSTGRES_SCHEMA} from ${SQLITE_SCHEMA}`);
  } else if (cmd === "check") {
    const current = existsSync(target) ? readFileSync(target, "utf8") : "";
    if (current !== expected) {
      console.error(`✖ ${POSTGRES_SCHEMA} is out of date. Run \`npm run db:pg-schema\` and commit the result.`);
      process.exit(1);
    }
    console.log(`✔ ${POSTGRES_SCHEMA} matches ${SQLITE_SCHEMA}`);
  } else {
    console.error("usage: node scripts/prisma-schema.mjs write|check|which");
    process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
