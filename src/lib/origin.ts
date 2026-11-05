/**
 * CSRF defence for state-changing requests: the browser-supplied Origin (or Referer)
 * must match the host serving the app (or APP_URL). Combined with SameSite=Lax cookies
 * and JSON-only bodies this blocks cross-site form posts.
 */
export function isSameOrigin(headers: Headers, appUrl = process.env.APP_URL): boolean {
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
  return allowed.has(sourceHost);
}

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
