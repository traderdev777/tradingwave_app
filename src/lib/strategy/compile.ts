import type { Strategy } from "./dsl";
import { parseStrategyText } from "./fallback";
import { DEFAULT_GEMINI_MODEL, geminiDraft } from "./gemini";
import { summarize, type Summary } from "./summary";
import { validateStrategy, type ValidationResult } from "./validate";

export type Engine = "gemini" | "rules";

export type CompileResult = {
  ok: boolean;
  engine: Engine;
  model: string | null;
  strategy: Strategy | null;
  summary: Summary | null;
  validation: Pick<ValidationResult, "ok" | "errors" | "warnings"> | null;
  suggestedName: string;
  assumed: string[];
  unparsed: string[];
  missing: string[];
  /** Shown to the user above the draft: key missing, Gemini failed and the rules engine took over, etc. */
  notice: string | null;
  error: string | null;
};

export type CompileEnv = { GEMINI_API_KEY?: string; GEMINI_MODEL?: string };
export type CompileOptions = { env?: CompileEnv; fetchImpl?: typeof fetch; lotSizes?: Record<string, number> };

export const KEY_MISSING_NOTICE =
  "Drafted by the built-in rules engine (English only). To enable Gemini and Hindi, Kannada, Tamil and Telugu input, an admin adds GEMINI_API_KEY to .env and restarts the app.";

export async function compileStrategy(text: string, opts: CompileOptions = {}): Promise<CompileResult> {
  const env = opts.env ?? (process.env as CompileEnv);
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  let notice: string | null = key ? null : KEY_MISSING_NOTICE;

  if (key) {
    const g = await geminiDraft(text, { apiKey: key, model, fetchImpl: opts.fetchImpl });
    if (g.ok) {
      return finish({ engine: "gemini", model: g.model, strategy: g.strategy, suggestedName: g.suggestedName, assumed: g.assumed, unparsed: g.unparsed, notice: g.repaired ? "Gemini's first draft didn't match the rule format; it was corrected once automatically." : null }, opts);
    }
    if (g.kind === "no_strategy") {
      return {
        ok: false, engine: "gemini", model: g.model, strategy: null, summary: null, validation: null, suggestedName: "",
        assumed: [], unparsed: g.unparsed, missing: g.missing, notice: null,
        error: g.missing.length ? `Couldn't build rules: missing ${g.missing.join("; ")}.` : "Couldn't build rules from that description.",
      };
    }
    notice = `Gemini couldn't draft this (${g.error}) so the built-in rules engine was used instead.`;
  }

  const r = parseStrategyText(text);
  if (!r.ok) {
    return {
      ok: false, engine: "rules", model: null, strategy: null, summary: null, validation: null, suggestedName: "",
      assumed: [], unparsed: r.unparsed, missing: r.missing, notice, error: r.error,
    };
  }
  return finish({ engine: "rules", model: null, strategy: r.strategy, suggestedName: r.suggestedName, assumed: r.assumed, unparsed: r.unparsed, notice }, opts);
}

function finish(
  d: { engine: Engine; model: string | null; strategy: Strategy; suggestedName: string; assumed: string[]; unparsed: string[]; notice: string | null },
  opts: CompileOptions,
): CompileResult {
  const v = validateStrategy(d.strategy, { lotSizes: opts.lotSizes });
  return {
    ok: true,
    engine: d.engine,
    model: d.model,
    strategy: v.strategy ?? d.strategy,
    summary: summarize(v.strategy ?? d.strategy),
    validation: { ok: v.ok, errors: v.errors, warnings: v.warnings },
    suggestedName: d.suggestedName,
    assumed: d.assumed,
    unparsed: d.unparsed,
    missing: [],
    notice: d.notice,
    error: null,
  };
}
