// npm run vercel-build — what Vercel runs to build TradingWave (Vercel prefers `vercel-build` over `build`).
// 1) checks required env (SESSION_SECRET, a Postgres DATABASE_URL) and fails with a clear message
// 2) checks prisma/postgres/schema.prisma is in sync with prisma/schema.prisma
// 3) prisma generate  --schema prisma/postgres/schema.prisma   (runtime client = Postgres)
// 4) prisma db push   --schema prisma/postgres/schema.prisma   (uses the direct/unpooled URL; refuses data loss)
// 5) next build
// Set SKIP_DB_PUSH=1 to skip step 4 (e.g. if you manage the schema yourself).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { POSTGRES_SCHEMA, SQLITE_SCHEMA, isPostgresUrl, readSchema, resolveDbEnv, root, toPostgresSchema } from "./prisma-schema.mjs";

const env = { ...resolveDbEnv(process.env), PRISMA_HIDE_UPDATE_MESSAGE: "1" };
const fail = (msg) => {
  console.error(`\n✖ vercel-build: ${msg}\n`);
  process.exit(1);
};

const secret = (env.SESSION_SECRET ?? "").trim();
if (secret.length < 32) {
  fail(
    "SESSION_SECRET is missing or shorter than 32 characters.\n" +
      "  Generate one with:  openssl rand -base64 48\n" +
      "  and add it in Vercel → Project → Settings → Environment Variables (Production and Preview).",
  );
}
if (!isPostgresUrl(env.DATABASE_URL)) {
  fail(
    "DATABASE_URL is not a postgres:// URL.\n" +
      "  On Vercel, add Neon from the project's Storage tab (it sets DATABASE_URL and DATABASE_URL_UNPOOLED),\n" +
      "  or set DATABASE_URL yourself. SQLite files do not work on Vercel (read-only, per-instance filesystem).",
  );
}
if (readSchema(POSTGRES_SCHEMA) !== toPostgresSchema(readSchema(SQLITE_SCHEMA))) {
  fail(`${POSTGRES_SCHEMA} is out of date with ${SQLITE_SCHEMA}. Run \`npm run db:pg-schema\` locally and commit.`);
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");
function run(label, file, args) {
  console.log(`→ ${label}`);
  const r = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: "inherit", env });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status})`);
}

run(`prisma generate --schema ${POSTGRES_SCHEMA}`, prismaCli, ["generate", "--schema", POSTGRES_SCHEMA]);
if (env.SKIP_DB_PUSH === "1") console.log("→ SKIP_DB_PUSH=1: not touching the database schema");
else run(`prisma db push --schema ${POSTGRES_SCHEMA}`, prismaCli, ["db", "push", "--skip-generate", "--schema", POSTGRES_SCHEMA]);
run("next build", nextCli, ["build"]);
console.log("\n✔ vercel-build complete");
