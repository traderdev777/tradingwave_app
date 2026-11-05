import { NextResponse } from "next/server";
import { isSameOrigin } from "./origin";

export function json(data: unknown, status = 200, init?: ResponseInit) {
  return NextResponse.json(data, { status, ...init });
}

/** Common guard for POST handlers: same-origin + JSON body. Returns parsed body or a Response. */
export async function readJsonPost(req: Request): Promise<{ body: unknown } | { response: Response }> {
  if (!isSameOrigin(req.headers)) {
    return { response: json({ ok: false, error: "This request came from an unexpected origin." }, 403) };
  }
  const type = req.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) {
    return { response: json({ ok: false, error: "Please send JSON." }, 415) };
  }
  try {
    const text = await req.text();
    if (text.length > 10_000) return { response: json({ ok: false, error: "Request too large." }, 413) };
    return { body: JSON.parse(text) };
  } catch {
    return { response: json({ ok: false, error: "Invalid JSON." }, 400) };
  }
}
