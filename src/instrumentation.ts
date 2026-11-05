import { assertServerConfig } from "@/lib/config";

// Runs once when a server instance starts (next start, or each Vercel function cold start).
export function register() {
  assertServerConfig();
}
