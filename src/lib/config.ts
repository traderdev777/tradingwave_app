/**
 * Server configuration checks. Called once per server instance from src/instrumentation.ts,
 * so a production deployment without a usable SESSION_SECRET fails loudly at startup
 * (visible in Vercel → Logs) instead of silently signing everyone out.
 */
export function configProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const problems: string[] = [];
  const secret = (env.SESSION_SECRET ?? "").trim();
  if (secret.length < 32) {
    problems.push(
      "SESSION_SECRET is missing or shorter than 32 characters. Generate one with `openssl rand -base64 48` " +
        "and set it in your hosting environment (Vercel → Settings → Environment Variables), or run `npm run setup` locally.",
    );
  }
  if (env.VERCEL === "1" && !/^postgres(ql)?:\/\//i.test(env.DATABASE_URL ?? "")) {
    problems.push("DATABASE_URL must be a postgres:// URL on Vercel (add Neon from the project's Storage tab).");
  }
  return problems;
}

export function assertServerConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const problems = configProblems(env);
  if (problems.length) throw new Error(`TradingWave configuration error:\n- ${problems.join("\n- ")}`);
}
