// npm run setup — prepares a fresh checkout to run locally.
// 1) creates .env from .env.example (with a generated SESSION_SECRET) if missing
// 2) generates the Prisma client
// 3) creates / updates the database schema (prisma db push)
// Works the same on Windows, macOS and Linux.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`TradingWave needs Node 20 or newer. You have ${process.versions.node}.`);
  process.exit(1);
}

if (!existsSync(path.join(root, "node_modules", "prisma"))) {
  console.error("Dependencies are missing. Run `npm install` first, then `npm run setup`.");
  process.exit(1);
}

let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : readFileSync(examplePath, "utf8");
const created = !existsSync(envPath);
const secretMatch = env.match(/^SESSION_SECRET=(.*)$/m);
const current = secretMatch ? secretMatch[1].replace(/^"|"$/g, "").trim() : "";
if (current.length < 32) {
  const secret = randomBytes(48).toString("base64url");
  env = secretMatch
    ? env.replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET="${secret}"`)
    : `${env.trimEnd()}\nSESSION_SECRET="${secret}"\n`;
  writeFileSync(envPath, env);
  console.log(created ? "✔ Created .env with a new SESSION_SECRET" : "✔ Added a SESSION_SECRET to .env");
} else if (created) {
  writeFileSync(envPath, env);
  console.log("✔ Created .env");
} else {
  console.log("✔ .env already present, left as is");
}

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
function prisma(args) {
  console.log(`→ prisma ${args.join(" ")}`);
  const r = spawnSync(process.execPath, [prismaCli, ...args], { cwd: root, stdio: "inherit", env: { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: "1" } });
  if (r.status !== 0) {
    console.error(`✖ prisma ${args.join(" ")} failed`);
    process.exit(r.status ?? 1);
  }
}

prisma(["generate"]);
prisma(["db", "push", "--skip-generate"]);

console.log("\n✔ Setup complete. Start the app with:  npm run dev  → http://localhost:3000\n");
