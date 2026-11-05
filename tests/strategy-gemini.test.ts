import { describe, expect, it, vi } from "vitest";
import { buildSystemPrompt, geminiDraft, readEnvelope } from "@/lib/strategy/gemini";
import { compileStrategy, KEY_MISSING_NOTICE } from "@/lib/strategy/compile";
import { niftyCall } from "./fixtures/strategies";

/** Realistic generateContent response shape (https://ai.google.dev/api/generate-content#v1beta.GenerateContentResponse). */
function geminiResponse(text: string, finishReason = "STOP") {
  return {
    candidates: [{ content: { parts: [{ text }], role: "model" }, finishReason, index: 0 }],
    usageMetadata: { promptTokenCount: 4120, candidatesTokenCount: 512, totalTokenCount: 4632 },
    modelVersion: "gemini-2.5-flash",
    responseId: "abc123",
  };
}
function res(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const envelope = (strategy: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ strategy, suggestedName: "NIFTY VWAP + RSI call", assumed: ["Expiry not stated: used the current weekly expiry."], unparsed: [], missing: [], ...extra });

describe("Gemini client (mocked fetch)", () => {
  it("sends a documented generateContent request and returns a parsed strategy", async () => {
    const fetchImpl = vi.fn(async () => res(geminiResponse(envelope(niftyCall()))));
    const r = await geminiDraft("NIFTY ATM call kharido jab 5 min close VWAP ke upar ho", { apiKey: "test-key", model: "gemini-2.5-flash", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.strategy).toEqual(niftyCall());
      expect(r.repaired).toBe(false);
      expect(r.suggestedName).toBe("NIFTY VWAP + RSI call");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.systemInstruction.parts[0].text).toContain("STRATEGY_SCHEMA");
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toContain("VWAP ke upar");
  });

  it("repairs once when the JSON doesn't match the schema, sending the validation errors back", async () => {
    const bad = { ...niftyCall(), timeframe: "2m" };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(res(geminiResponse("```json\n" + envelope(bad) + "\n```")))
      .mockResolvedValueOnce(res(geminiResponse(envelope(niftyCall()))));
    const r = await geminiDraft("Buy NIFTY ATM call…", { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.repaired).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const second = JSON.parse(String((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(second.contents).toHaveLength(3);
    expect(second.contents[1].role).toBe("model");
    expect(second.contents[2].parts[0].text).toContain("strategy.timeframe");
  });

  it("gives up after one failed repair instead of looping", async () => {
    const fetchImpl = vi.fn(async () => res(geminiResponse("not json at all")));
    const r = await geminiDraft("x", { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, kind: "error" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("maps HTTP errors to clear messages", async () => {
    const forbidden = vi.fn(async () => res({ error: { code: 403, message: "Method doesn't allow unregistered callers.", status: "PERMISSION_DENIED" } }, 403));
    const r1 = await geminiDraft("x", { apiKey: "k", fetchImpl: forbidden as unknown as typeof fetch });
    expect(r1).toMatchObject({ ok: false, kind: "error", status: 403 });
    if (!r1.ok && r1.kind === "error") expect(r1.error).toMatch(/GEMINI_API_KEY/);

    const badKey = vi.fn(async () => res({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }, 400));
    const r2 = await geminiDraft("x", { apiKey: "k", fetchImpl: badKey as unknown as typeof fetch });
    if (!r2.ok && r2.kind === "error") expect(r2.error).toMatch(/rejected the API key/);

    const quota = vi.fn(async () => res({ error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" } }, 429));
    const r3 = await geminiDraft("x", { apiKey: "k", fetchImpl: quota as unknown as typeof fetch });
    if (!r3.ok && r3.kind === "error") expect(r3.error).toMatch(/rate limit|quota/);

    const network = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const r4 = await geminiDraft("x", { apiKey: "k", fetchImpl: network as unknown as typeof fetch });
    expect(r4).toMatchObject({ ok: false, kind: "error", status: 0 });
  });

  it("handles blocked prompts and early stops", async () => {
    const blocked = vi.fn(async () => res({ promptFeedback: { blockReason: "SAFETY" } }));
    expect(await geminiDraft("x", { apiKey: "k", fetchImpl: blocked as unknown as typeof fetch })).toMatchObject({ ok: false, kind: "error" });
    const maxTokens = vi.fn(async () => res(geminiResponse('{"strategy": {', "MAX_TOKENS")));
    const r = await geminiDraft("x", { apiKey: "k", fetchImpl: maxTokens as unknown as typeof fetch });
    if (!r.ok && r.kind === "error") expect(r.error).toMatch(/MAX_TOKENS/);
  });

  it("returns missing parts when the model can't build a strategy", async () => {
    const f = vi.fn(async () => res(geminiResponse(envelope(null, { missing: ["which instrument"], assumed: [] }))));
    const r = await geminiDraft("buy something", { apiKey: "k", fetchImpl: f as unknown as typeof fetch });
    expect(r).toMatchObject({ ok: false, kind: "no_strategy", missing: ["which instrument"] });
  });

  it("readEnvelope strips code fences and reports schema issues", () => {
    expect(readEnvelope("```json\n" + envelope(niftyCall()) + "\n```").ok).toBe(true);
    const r = readEnvelope(JSON.stringify({ strategy: { schemaVersion: 1 } }));
    expect(r.ok).toBe(false);
  });

  it("the prompt covers the five languages and the never-invent rule", () => {
    const p = buildSystemPrompt();
    for (const w of ["English", "Hindi", "Kannada", "Tamil", "Telugu", "Never invent a stop loss"]) expect(p).toContain(w);
  });
});

describe("compile orchestration", () => {
  const text = "Buy NIFTY ATM call when 5 min close above VWAP and RSI 14 above 60 after 9:30, SL 20% target 40%, square off 3:10, stop if I lose 2000 in a day";

  it("uses the rules engine with an admin note when GEMINI_API_KEY is missing", async () => {
    const fetchImpl = vi.fn();
    const r = await compileStrategy(text, { env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.engine).toBe("rules");
    expect(r.notice).toBe(KEY_MISSING_NOTICE);
    expect(r.validation?.errors).toEqual([]);
    expect(r.summary?.headline).toContain("NIFTY");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("uses Gemini when a key is set, and builds the summary from the DSL", async () => {
    const fetchImpl = vi.fn(async () => res(geminiResponse(envelope(niftyCall()))));
    const r = await compileStrategy(text, { env: { GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-2.5-pro" }, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.engine).toBe("gemini");
    expect(r.model).toBe("gemini-2.5-pro");
    expect(r.summary?.headline).toBe("Buy NIFTY at-the-money call (CE) (current weekly expiry), 1 lot, on NFO.");
    expect(String((fetchImpl.mock.calls[0] as unknown as [string])[0])).toContain("models/gemini-2.5-pro:generateContent");
  });

  it("falls back to the rules engine, and says so, when Gemini fails", async () => {
    const fetchImpl = vi.fn(async () => res({ error: { code: 403, message: "denied" } }, 403));
    const r = await compileStrategy(text, { env: { GEMINI_API_KEY: "k" }, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.engine).toBe("rules");
    expect(r.ok).toBe(true);
    expect(r.notice).toMatch(/Gemini couldn't draft this/);
  });

  it("runs the deterministic validator on Gemini output (LIVE is blocked)", async () => {
    const live = { ...niftyCall(), mode: "LIVE" };
    const fetchImpl = vi.fn(async () => res(geminiResponse(envelope(live))));
    const r = await compileStrategy(text, { env: { GEMINI_API_KEY: "k" }, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.validation?.errors.map((e) => e.code)).toContain("live_disabled");
  });
});
