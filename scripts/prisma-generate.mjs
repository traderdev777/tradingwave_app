// postinstall: generate the Prisma client for the right database.
// Local (DATABASE_URL=file:...)          → prisma/schema.prisma (SQLite), exactly as before.
// Vercel (VERCEL=1) or postgres:// URL   → prisma/postgres/schema.prisma.
// vercel-build generates again explicitly, so a cached node_modules on Vercel can never ship a SQLite client.
// Never fails `npm install`: if the Prisma CLI is missing (e.g. --omit=dev) it just skips.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pickSchema, root } from "./prisma-schema.mjs";

const cli = path.join(root, "node_modules", "prisma", "build", "index.js");
if (!existsSync(cli)) {
  console.log("prisma CLI not installed; skipping prisma generate");
  process.exit(0);
}
const schema = pickSchema();
console.log(`→ prisma generate --schema ${schema}`);
const r = spawnSync(process.execPath, [cli, "generate", "--schema", schema], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" },
});
process.exit(r.status ?? 1);
