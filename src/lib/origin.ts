/**
 * CSRF defence for state-changing requests: the browser-supplied Origin (or Referer)
 * must match the host serving the app (or APP_URL). Combined with SameSite=Lax cookies
 * and JSON-only bodies this blocks cross-site form posts.
 */
export function isSameOrigin(headers: Headers, appUrl = process.env.APP_URL, env: NodeJS.ProcessEnv = process.env): boolean {
  const source = headers.get("origin") ?? refererOrigin(headers.get("referer"));
  if (!source || source === "null") return false;
  let sourceHost: string;
  try {
    sourceHost = new URL(source).host.toLowerCase();
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) allowed.add(host.split(",")[0]!.trim().toLowerCase());
  if (appUrl) {
    try {
      allowed.add(new URL(appUrl).host.toLowerCase());
    } catch {
      /* ignore bad APP_URL */
    }
  }
  // Vercel system env (bare hostnames): this deployment's URL, its branch URL and the production domain.
  for (const h of [env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]) {
    if (h) allowed.add(h.trim().toLowerCase());
  }
  return allowed.has(sourceHost);
}

/**
 * True when the request reached us over HTTPS. Vercel (and most proxies) terminate TLS and set
 * x-forwarded-proto=https; on Vercel deployments (VERCEL_ENV set) everything is HTTPS anyway.
 */
export function isHttpsRequest(headers: Headers, env: NodeJS.ProcessEnv = process.env): boolean {
  if (headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase() === "https") return true;
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") return true;
  return (env.APP_URL ?? "").startsWith("https://");
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
