import { z } from "zod";
import { parseStrategy, strategySchema, type Strategy } from "./dsl";

/**
 * Google Gemini client (REST, generateContent) used ONLY to draft a Strategy DSL from text.
 * It never sees broker credentials and nothing it returns is executed: its output goes
 * through zod and the deterministic validator, then the user reviews and approves it.
 *
 * Docs: https://ai.google.dev/api/generate-content
 *   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 *   header x-goog-api-key: <GEMINI_API_KEY>
 */

export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export type GeminiConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type GeminiDraft =
  | { ok: true; strategy: Strategy; suggestedName: string; assumed: string[]; unparsed: string[]; repaired: boolean; model: string }
  | { ok: false; kind: "no_strategy"; missing: string[]; unparsed: string[]; model: string }
  | { ok: false; kind: "error"; error: string; status?: number; model: string };

export class GeminiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** What we ask the model to return around the DSL. */
const envelopeSchema = z.object({
  strategy: z.unknown().nullable(),
  suggestedName: z.string().max(120).optional().default(""),
  assumed: z.array(z.string().max(400)).max(30).optional().default([]),
  unparsed: z.array(z.string().max(400)).max(30).optional().default([]),
  missing: z.array(z.string().max(400)).max(30).optional().default([]),
});

let cachedSchemaText: string | null = null;
function strategyJsonSchema(): string {
  if (!cachedSchemaText) cachedSchemaText = JSON.stringify(z.toJSONSchema(strategySchema, { io: "input", unrepresentable: "any" }));
  return cachedSchemaText;
}

export function buildSystemPrompt(): string {
  return [
    "You convert a trader's plain-language description of an Indian-market trading strategy into a JSON rule object.",
    "You only draft rules. You never place orders, give advice, or predict returns.",
    "",
    "LANGUAGES: the description may be in English, Hindi (Devanagari or romanised Hinglish), Kannada, Tamil or Telugu, or a mix. Understand it in any of these. Write every string you return (suggestedName, assumed, unparsed, missing) in plain English.",
    "",
    "OUTPUT: reply with ONE JSON object and nothing else, shaped exactly like:",
    '{"strategy": <object matching STRATEGY_SCHEMA, or null>, "suggestedName": string, "assumed": string[], "unparsed": string[], "missing": string[]}',
    "",
    "RULES:",
    "- Never invent a stop loss or a daily loss cap. If the user did not state one, set exit.stopLoss to null or risk.dailyLossCap to null.",
    "- Anything you fill in by convention (timeframe, expiry, position size, trading window, trades per day, standard indicator settings) must be listed in `assumed`, one short sentence each.",
    "- Any part of the text you cannot represent in the schema goes in `unparsed`, quoted. Do not approximate it with a different rule.",
    "- If the instrument, the buy/sell side, or any entry rule is missing, return strategy: null and list what is missing in `missing`.",
    "- mode is always \"PAPER\". risk.killSwitch is true unless the user says otherwise. schemaVersion is 1.",
    "- Times are IST, 24-hour \"HH:MM\". In a trading context \"3:10\" means 15:10.",
    "- Exchanges: NSE/BSE = cash equity only. Index and stock futures/options = NFO (NSE) or BFO (BSE: SENSEX, BANKEX, SENSEX50). Currency derivatives = CDS, only USDINR, EURINR, GBPINR, JPYINR, EURUSD, GBPUSD, USDJPY. Commodities = MCX. Crypto = CRYPTO (spot = segment cash).",
    "- Offshore forex pairs (e.g. GBPJPY, XAUUSD, AUDUSD) are not allowed for Indian residents: still map them faithfully to CDS so the validator can reject them; do not substitute another pair.",
    "- Weekly expiries exist only for NIFTY (NFO) and SENSEX (BFO). Other index and stock options and all futures are monthly.",
    "- Symbols are uppercase exchange symbols: NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX, RELIANCE, HDFCBANK, USDINR, CRUDEOIL, BTCINR.",
    "- A straddle is two option legs (CE and PE) at the ATM strike with the same side; a strangle is CE and PE OTM. For multi-leg exits on the combined premium set exit.basis to \"combined\".",
    "- \"after 9:30\" sets window.start; \"at 9:20\" is an entry condition {left:{kind:\"time\"}, op:\">=\", right:{kind:\"time_const\", value:\"09:20\"}}.",
    "- When the left side of a comparison is implied (\"when it breaks yesterday's high\"), use {kind:\"price\", field:\"close\"}.",
    "- Position sizing in lots for futures/options, qty or capital_pct for cash.",
    "",
    "STRATEGY_SCHEMA (JSON Schema):",
    strategyJsonSchema(),
  ].join("\n");
}

type GenerateContentResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[]; role?: string }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  modelVersion?: string;
  error?: { code?: number; message?: string; status?: string };
};

type Content = { role: "user" | "model"; parts: { text: string }[] };

async function callGemini(cfg: Required<Pick<GeminiConfig, "apiKey">> & GeminiConfig, contents: Content[]): Promise<string> {
  const model = cfg.model || DEFAULT_GEMINI_MODEL;
  const url = `${cfg.baseUrl ?? GEMINI_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const doFetch = cfg.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await doFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        contents,
        generationConfig: { responseMimeType: "application/json", temperature: 0, maxOutputTokens: 8192 },
      }),
      signal: ctrl.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    throw new GeminiHttpError(0, aborted ? "Gemini took too long to answer." : "Couldn't reach Gemini (network error).");
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => ({}))) as GenerateContentResponse;
  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    const friendly =
      res.status === 400 && /api key/i.test(msg) ? "Gemini rejected the API key. Check GEMINI_API_KEY in .env."
      : res.status === 401 || res.status === 403 ? "Gemini refused the request (check GEMINI_API_KEY and that the Generative Language API is enabled)."
      : res.status === 404 ? `Gemini model "${model}" was not found. Check GEMINI_MODEL in .env.`
      : res.status === 429 ? "Gemini rate limit or quota reached. Try again in a minute."
      : res.status >= 500 ? "Gemini is having trouble right now."
      : `Gemini error: ${msg}`;
    throw new GeminiHttpError(res.status, friendly);
  }
  if (data.promptFeedback?.blockReason) throw new GeminiHttpError(200, `Gemini blocked the request (${data.promptFeedback.blockReason}).`);
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  if (!text) throw new GeminiHttpError(200, `Gemini returned no text${cand?.finishReason ? ` (${cand.finishReason})` : ""}.`);
  if (cand?.finishReason && cand.finishReason !== "STOP") throw new GeminiHttpError(200, `Gemini stopped early (${cand.finishReason}).`);
  return text;
}

/** Parse the model's text into an envelope; return issues for a repair round if it doesn't fit. */
export function readEnvelope(text: string):
  | { ok: true; strategy: Strategy | null; suggestedName: string; assumed: string[]; unparsed: string[]; missing: string[] }
  | { ok: false; issues: string[] } {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  let raw: unknown;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    return { ok: false, issues: ["The reply was not valid JSON."] };
  }
  const env = envelopeSchema.safeParse(raw);
  if (!env.success) return { ok: false, issues: env.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`) };
  if (env.data.strategy === null || env.data.strategy === undefined) {
    return { ok: true, strategy: null, suggestedName: env.data.suggestedName, assumed: env.data.assumed, unparsed: env.data.unparsed, missing: env.data.missing };
  }
  const st = parseStrategy(env.data.strategy);
  if (!st.success) return { ok: false, issues: st.error.issues.slice(0, 20).map((i) => `strategy.${i.path.join(".")}: ${i.message}`) };
  return { ok: true, strategy: st.data, suggestedName: env.data.suggestedName, assumed: env.data.assumed, unparsed: env.data.unparsed, missing: env.data.missing };
}

export async function geminiDraft(description: string, cfg: GeminiConfig): Promise<GeminiDraft> {
  const model = cfg.model || DEFAULT_GEMINI_MODEL;
  const first: Content = { role: "user", parts: [{ text: `Strategy description:\n"""\n${description}\n"""` }] };
  try {
    const text1 = await callGemini(cfg, [first]);
    let env = readEnvelope(text1);
    let repaired = false;
    if (!env.ok) {
      // One repair round with the exact validation errors.
      repaired = true;
      const text2 = await callGemini(cfg, [
        first,
        { role: "model", parts: [{ text: text1 }] },
        {
          role: "user",
          parts: [{ text: `Your JSON did not match the schema:\n- ${env.issues.join("\n- ")}\nReturn the corrected JSON object only, same shape, fixing only these problems.` }],
        },
      ]);
      env = readEnvelope(text2);
      if (!env.ok) return { ok: false, kind: "error", error: `Gemini's draft still didn't match the rule format after one repair: ${env.issues.slice(0, 3).join("; ")}`, model };
    }
    if (!env.strategy) return { ok: false, kind: "no_strategy", missing: env.missing, unparsed: env.unparsed, model };
    return { ok: true, strategy: env.strategy, suggestedName: env.suggestedName.slice(0, 80), assumed: env.assumed, unparsed: env.unparsed, repaired, model };
  } catch (e) {
    if (e instanceof GeminiHttpError) return { ok: false, kind: "error", error: e.message, status: e.status, model };
    return { ok: false, kind: "error", error: "Unexpected error while calling Gemini.", model };
  }
}
