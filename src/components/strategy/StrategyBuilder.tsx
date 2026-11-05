"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import type { CompileResult } from "@/lib/strategy/compile";
import { postJson } from "./fields";
import { PassportEditor } from "./PassportEditor";

export const EXAMPLES = [
  "Buy NIFTY ATM call when 5 min close above VWAP and RSI 14 above 60 after 9:30, SL 20% target 40%, square off 3:10, stop if I lose 2000 in a day",
  "Sell BANKNIFTY straddle at 9:20, exit if combined premium rises 25%",
  "Buy RELIANCE when 15m EMA 9 crosses above EMA 21, SL 1%, target 2%",
  "Buy USDINR futures when it breaks yesterday's high, exit at 0.3%",
];
const CHIP_LABELS = ["NIFTY call · VWAP + RSI", "BANKNIFTY straddle", "RELIANCE EMA cross", "USDINR breakout"];

type Draft = CompileResult & { sourceText: string };

export function StrategyBuilder({ geminiEnabled, lotSizes }: { geminiEnabled: boolean; lotSizes: Record<string, number> }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ text: string; missing?: string[]; unparsed?: string[]; notice?: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const passportRef = useRef<HTMLDivElement>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (text.trim().length < 8) return setError({ text: "Describe your strategy in a sentence or two." });
    setBusy(true);
    const r = await postJson<Partial<CompileResult> & { fields?: Record<string, string> }>("/api/strategies/compile", { text });
    setBusy(false);
    if (r.status === 401) return router.replace("/login?next=/app/strategies/new");
    if (r.ok && r.strategy) {
      setDraft({ ...(r as CompileResult), sourceText: text.trim() });
      setDraftKey((k) => k + 1);
      requestAnimationFrame(() => passportRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return;
    }
    setDraft(null);
    setError({ text: r.error ?? "Couldn\u2019t draft rules from that.", missing: r.missing, unparsed: r.unparsed, notice: r.notice });
  }

  return (
    <div className="builder">
      <form className="panel builder__form" onSubmit={onSubmit} noValidate>
        <label className="tw-field">
          <span className="tw-field__label builder__label">Describe your strategy</span>
          <textarea
            name="text"
            rows={5}
            maxLength={2000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Buy NIFTY ATM call when 5 min close is above VWAP after 9:30, SL 20%, target 40%, square off 3:10, stop if I lose ₹2000 in a day"
            aria-describedby="lang-hint"
          />
          <span className="tw-field__hint" id="lang-hint">
            {geminiEnabled
              ? "Write in English, Hindi or Hinglish, Kannada, Tamil or Telugu. Include the instrument, when to enter, your stop loss and a daily loss limit."
              : "Write in English. Include the instrument, when to enter, your stop loss and a daily loss limit."}
            <span className="builder__count mono">{text.length}/2000</span>
          </span>
        </label>
        <div className="builder__chips" role="group" aria-label="Examples">
          <span className="builder__chips-label mono">Try</span>
          {EXAMPLES.map((ex, i) => (
            <button key={ex} type="button" className="chip" title={ex} onClick={() => { setText(ex); setError(null); }}>
              {CHIP_LABELS[i]}
            </button>
          ))}
        </div>
        <div className="tw-form__row">
          <button className="btn btn--accent btn--sm" type="submit" disabled={busy}>
            {busy ? "Drafting\u2026" : "Draft rules"}
          </button>
          <span className="builder__engine">
            Engine: <strong>{geminiEnabled ? "Gemini" : "Rules engine"}</strong>
          </span>
        </div>
        {!geminiEnabled && (
          <p className="builder__note">
            Gemini isn&rsquo;t set up, so drafts use the built-in rules engine (English only). Admin: add <code className="mono">GEMINI_API_KEY=&quot;…&quot;</code> to <code className="mono">.env</code> and restart the app.
          </p>
        )}
        <p className="builder__safe">AI only drafts rules. It never places orders. You review and approve every rule, and approved strategies paper trade only.</p>
      </form>

      {error && (
        <section className="tw-alert builder__err" role="alert">
          <p><strong>{error.text}</strong></p>
          {error.notice && <p className="muted">{error.notice}</p>}
          {!!error.unparsed?.length && (
            <p>Couldn&rsquo;t read: {error.unparsed.map((u) => `\u201c${u}\u201d`).join(", ")}</p>
          )}
        </section>
      )}

      {draft?.strategy && (
        <div ref={passportRef} className="builder__passport">
          <PassportEditor
            key={draftKey}
            mode="create"
            initial={draft.strategy}
            lotSizes={lotSizes}
            name={draft.suggestedName || "Untitled strategy"}
            sourceText={draft.sourceText}
            meta={{ engine: draft.engine, model: draft.model, notice: geminiEnabled ? draft.notice : null, assumed: draft.assumed, unparsed: draft.unparsed }}
            onStartOver={() => { setDraft(null); setText(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}
          />
        </div>
      )}
    </div>
  );
}
