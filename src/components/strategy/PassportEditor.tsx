"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { canonicalJson, EXCHANGES, TIMEFRAMES, type Leg, type Strategy } from "@/lib/strategy/dsl";
import { summarize } from "@/lib/strategy/summary";
import { validateStrategy, type Issue } from "@/lib/strategy/validate";
import { ConditionEditor } from "./ConditionEditor";
import { FieldMsg, NumberInput, postJson, Select, TimeInput, Toggle, type Opt } from "./fields";

export type PassportMeta = {
  engine: "gemini" | "rules" | "manual";
  model?: string | null;
  notice?: string | null;
  assumed?: string[];
  unparsed?: string[];
};

type Props = {
  mode: "create" | "edit";
  initial: Strategy;
  lotSizes: Record<string, number>;
  name: string;
  sourceText: string;
  meta: PassportMeta;
  strategyId?: string;
  current?: { versionId: string; version: number; approved: boolean; archived: boolean };
  startEditing?: boolean;
  onStartOver?: () => void;
};

const SEGMENT_OPTS: Opt<Strategy["instrument"]["segment"]>[] = [
  { value: "cash", label: "Cash / spot" },
  { value: "futures", label: "Futures" },
  { value: "options", label: "Options" },
];
const EXCHANGE_LABELS: Record<string, string> = {
  NSE: "NSE (equity cash)", BSE: "BSE (equity cash)", NFO: "NFO (NSE F&O)", BFO: "BFO (BSE F&O)", CDS: "CDS (currency)", MCX: "MCX (commodities)", CRYPTO: "Crypto (FIU-IND exchange)",
};
const TF_LABELS: Record<string, string> = { "1m": "1 minute", "3m": "3 minutes", "5m": "5 minutes", "15m": "15 minutes", "30m": "30 minutes", "1h": "1 hour", "1d": "1 day" };

/** Field paths that render their own inline message; anything else in a card shows in the card footer. */
const INLINE = new Set([
  "instrument.exchange", "instrument.symbol", "instrument.segment", "instrument.expiry", "instrument.expiry.cycle", "timeframe",
  "exit.stopLoss", "exit.stopLoss.value", "exit.target", "exit.target.value", "exit.trailingStop", "exit.trailingStop.value", "exit.squareOffAt", "exit.basis",
  "window.start", "window.end", "maxTradesPerDay", "sizing.value", "sizing.mode", "risk.dailyLossCap", "risk.maxOpenPositions", "risk.killSwitch", "mode",
]);

const CARDS = [
  { id: "instrument", label: "Instrument", prefixes: ["instrument", "legs", "timeframe"] },
  { id: "entry", label: "Entry", prefixes: ["entry"] },
  { id: "exit", label: "Exit", prefixes: ["exit"] },
  { id: "window", label: "Trading window", prefixes: ["window", "maxTradesPerDay"] },
  { id: "risk", label: "Size & risk", prefixes: ["sizing", "risk", "mode"] },
] as const;

function cardOf(path: string): string {
  for (const c of CARDS) if (c.prefixes.some((p) => path === p || path.startsWith(p + "."))) return c.id;
  return "instrument";
}

export function PassportEditor(props: Props) {
  const router = useRouter();
  const [dsl, setDsl] = useState<Strategy>(props.initial);
  const [name, setName] = useState(props.name);
  const [editing, setEditing] = useState(props.mode === "create" || !!props.startEditing);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState<null | "draft" | "approve">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const v = useMemo(() => validateStrategy(dsl, { lotSizes: props.lotSizes }), [dsl, props.lotSizes]);
  const summary = useMemo(() => (v.strategy ? summarize(v.strategy) : null), [v.strategy]);
  const dirty = canonicalJson(dsl) !== canonicalJson(props.initial);
  const nameDirty = name.trim() !== props.name;
  const archived = !!props.current?.archived;
  const errors = v.errors;
  const warnings = v.warnings;

  function update(fn: (d: Strategy) => void) {
    setDsl((prev) => {
      const d = structuredClone(prev);
      fn(d);
      return d;
    });
    setMsg(null);
  }

  async function save(approve: boolean) {
    setMsg(null);
    if (approve && !confirm) return setMsg({ kind: "err", text: "Tick the confirmation to approve." });
    setBusy(approve ? "approve" : "draft");
    if (props.mode === "create") {
      const r = await postJson<{ id?: string }>("/api/strategies", {
        name: name.trim(), sourceText: props.sourceText, engine: props.meta.engine, dsl, approve, confirmPaper: approve && confirm, editedAfterDraft: dirty,
      });
      setBusy(null);
      if (r.status === 401) return router.replace("/login");
      if (r.ok && r.id) return router.push(`/app/strategies/${r.id}`);
      return setMsg({ kind: "err", text: r.error ?? "Couldn\u2019t save." });
    }
    const r = await postJson<{ version?: number; unchanged?: boolean }>(`/api/strategies/${props.strategyId}/versions`, {
      name: name.trim(), dsl, approve, confirmPaper: approve && confirm,
    });
    setBusy(null);
    if (r.status === 401) return router.replace("/login");
    if (!r.ok) return setMsg({ kind: "err", text: r.error ?? "Couldn\u2019t save." });
    setMsg({ kind: "ok", text: r.unchanged ? (approve ? `Version ${r.version} approved.` : "No changes to save.") : `Saved as version ${r.version}${approve ? " and approved" : ""}.` });
    setEditing(false);
    setConfirm(false);
    router.refresh();
  }

  const byCard = (id: string, list: Issue[]) => list.filter((i) => cardOf(i.path) === id);
  const footerIssues = (id: string, list: Issue[]) => byCard(id, list).filter((i) => !INLINE.has(i.path) && !i.path.startsWith("entry.conditions.") && !/^legs\.\d+\./.test(i.path));
  const canApprove = errors.length === 0 && !archived && (props.mode === "create" || dirty || !props.current?.approved);
  const engineLabel = props.meta.engine === "gemini" ? `Gemini${props.meta.model ? ` · ${props.meta.model}` : ""}` : props.meta.engine === "rules" ? "Rules engine" : "you (edited by hand)";

  return (
    <div className="pp" aria-label="Strategy Passport">
      <section className="panel pp-head">
        <div className="pp-head__top">
          <p className="eyebrow">Strategy Passport</p>
          <span className={`pp-engine pp-engine--${props.meta.engine}`} title="Which engine wrote this draft">
            {props.meta.engine === "manual" ? "Last change by" : "Drafted by"}: <strong>{engineLabel}</strong>
          </span>
        </div>
        {props.mode === "create" || editing ? (
          <label className="tw-field pp-name">
            <span className="tw-field__label">Strategy name</span>
            <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={!name.trim() || undefined} />
          </label>
        ) : null}
        {props.meta.notice && <p className="pp-note">{props.meta.notice}</p>}
        {props.sourceText && (
          <blockquote className="pp-source">
            <span className="pp-source__label mono">You said</span>
            {props.sourceText}
          </blockquote>
        )}
        {!!props.meta.unparsed?.length && (
          <div className="pp-flag pp-flag--err">
            <strong>We couldn&rsquo;t read these parts.</strong> Nothing was guessed for them. Edit the rules below, or rephrase and draft again.
            <ul>{props.meta.unparsed.map((u) => <li key={u}>&ldquo;{u}&rdquo;</li>)}</ul>
          </div>
        )}
        {!!props.meta.assumed?.length && (
          <div className="pp-flag">
            <strong>Filled in by convention. Check these:</strong>
            <ul>{props.meta.assumed.map((u) => <li key={u}>{u}</li>)}</ul>
          </div>
        )}
      </section>

      <section className="panel pp-read" aria-label="Readable rules">
        <div className="pp-read__head">
          <h2 className="panel__title">What will run</h2>
          <ValidationBadge errors={errors.length} warnings={warnings.length} />
        </div>
        {summary ? (
          <>
            <p className="pp-headline">{summary.headline}</p>
            <dl className="pp-sum">
              {summary.sections.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.lines.map((l) => <span key={l}>{l}</span>)}</dd>
                </div>
              ))}
            </dl>
          </>
        ) : (
          <p className="muted">The rules have a field that needs fixing before we can describe them. See the errors below.</p>
        )}
        {(errors.length > 0 || warnings.length > 0) && !editing && (
          <IssueList errors={errors} warnings={warnings} />
        )}
      </section>

      {editing && (
        <>
          {(errors.length > 0 || warnings.length > 0) && (
            <section className="panel pp-issues" aria-live="polite">
              <h2 className="panel__title">Checks</h2>
              <IssueList errors={errors} warnings={warnings} linkable />
            </section>
          )}

          {/* Instrument */}
          <section className="panel pp-card" id="card-instrument">
            <CardHead n="01" title="Instrument" count={byCard("instrument", errors).length} />
            <div className="pp-grid">
              <div>
                <Select label="Exchange" value={dsl.instrument.exchange} options={EXCHANGES.map((e) => ({ value: e, label: EXCHANGE_LABELS[e] ?? e }))}
                  invalid={!!errors.find((e) => e.path === "instrument.exchange")}
                  onChange={(exchange) => update((d) => { d.instrument.exchange = exchange; })} />
                <FieldMsg errors={errors} warnings={warnings} path="instrument.exchange" />
              </div>
              <div>
                <label className="tw-field">
                  <span className="tw-field__label">Symbol / underlying</span>
                  <input value={dsl.instrument.symbol} maxLength={24} autoCapitalize="characters" spellCheck={false}
                    aria-invalid={!!errors.find((e) => e.path === "instrument.symbol") || undefined}
                    onChange={(e) => { const val = e.target.value.toUpperCase(); update((d) => { d.instrument.symbol = val; }); }} />
                </label>
                <FieldMsg errors={errors} warnings={warnings} path="instrument.symbol" />
              </div>
              <div>
                <Select label="Segment" value={dsl.instrument.segment} options={SEGMENT_OPTS} invalid={!!errors.find((e) => e.path === "instrument.segment")}
                  onChange={(segment) => update((d) => {
                    d.instrument.segment = segment;
                    if (segment === "cash") { d.instrument.expiry = null; d.legs = [{ side: d.legs[0]?.side ?? "BUY", option: null }]; if (d.sizing.mode === "lots") d.sizing = { mode: "qty", value: 1 }; }
                    else if (!d.instrument.expiry && d.instrument.exchange !== "CRYPTO") d.instrument.expiry = { cycle: "monthly", which: "current" };
                    if (segment === "options") d.legs = d.legs.map((l) => ({ ...l, option: l.option ?? { right: "CE", strike: { mode: "ATM" } } }));
                    if (segment === "futures") d.legs = [{ side: d.legs[0]?.side ?? "BUY", option: null }];
                  })} />
                <FieldMsg errors={errors} warnings={warnings} path="instrument.segment" />
              </div>
              <div>
                <Select label="Candle timeframe" value={dsl.timeframe} options={TIMEFRAMES.map((t) => ({ value: t, label: TF_LABELS[t] ?? t }))}
                  onChange={(timeframe) => update((d) => { d.timeframe = timeframe; })} />
                <FieldMsg errors={errors} warnings={warnings} path="timeframe" />
              </div>
              {dsl.instrument.segment !== "cash" && (
                <div>
                  <Select label="Expiry" value={dsl.instrument.expiry ? `${dsl.instrument.expiry.which}-${dsl.instrument.expiry.cycle}` : "none"}
                    invalid={!!errors.find((e) => e.path.startsWith("instrument.expiry"))}
                    options={[
                      { value: "current-weekly", label: "Current week" },
                      { value: "next-weekly", label: "Next week" },
                      { value: "current-monthly", label: "Current month" },
                      { value: "next-monthly", label: "Next month" },
                      { value: "none", label: "None (perpetual)" },
                    ]}
                    onChange={(val) => update((d) => {
                      if (val === "none") d.instrument.expiry = null;
                      else { const [which, cycle] = val.split("-") as ["current" | "next", "weekly" | "monthly"]; d.instrument.expiry = { which, cycle }; }
                    })} />
                  <FieldMsg errors={errors} warnings={warnings} path="instrument.expiry" />
                  <FieldMsg errors={errors} warnings={warnings} path="instrument.expiry.cycle" />
                </div>
              )}
            </div>

            <div className="pp-legs">
              <h3 className="pp-sub">{dsl.legs.length > 1 ? "Legs" : "Order"}</h3>
              {dsl.legs.map((leg, i) => (
                <LegRow key={i} i={i} leg={leg} options={dsl.instrument.segment === "options"} errors={errors}
                  canRemove={dsl.legs.length > 1}
                  onChange={(l) => update((d) => { d.legs[i] = l; })}
                  onRemove={() => update((d) => { d.legs.splice(i, 1); })} />
              ))}
              {dsl.instrument.segment === "options" && dsl.legs.length < 4 && (
                <button type="button" className="btn btn--ghost btn--xs" onClick={() => update((d) => { d.legs.push({ side: d.legs[0]?.side ?? "BUY", option: { right: "PE", strike: { mode: "ATM" } } }); })}>
                  + Add leg
                </button>
              )}
            </div>
            <CardFooter issues={footerIssues("instrument", errors)} warns={footerIssues("instrument", warnings)} />
          </section>

          {/* Entry */}
          <section className="panel pp-card" id="card-entry">
            <CardHead n="02" title="Entry" count={byCard("entry", errors).length} />
            <ConditionEditor group={dsl.entry.conditions} path="entry.conditions" errors={errors}
              onChange={(g) => update((d) => { d.entry.conditions = g; })} />
            <CardFooter issues={footerIssues("entry", errors)} warns={byCard("entry", warnings)} />
          </section>

          {/* Exit */}
          <section className="panel pp-card" id="card-exit">
            <CardHead n="03" title="Exit" count={byCard("exit", errors).length} />
            <div className="pp-grid">
              <div className="pp-pair">
                <Select label="Stop loss" value={dsl.exit.stopLoss?.type ?? "none"} invalid={!!errors.find((e) => e.path.startsWith("exit.stopLoss"))}
                  options={[{ value: "none", label: "None" }, { value: "percent", label: "Percent" }, { value: "points", label: "Points" }, { value: "atr", label: "ATR multiple" }]}
                  onChange={(t) => update((d) => {
                    const val = d.exit.stopLoss?.value ?? Number.NaN;
                    d.exit.stopLoss = t === "none" ? null : t === "atr" ? { type: "atr", value: val, atrPeriod: 14 } : { type: t, value: val };
                  })} />
                {dsl.exit.stopLoss && (
                  <NumberInput label="Stop loss value" hideLabel value={dsl.exit.stopLoss.value} suffix={dsl.exit.stopLoss.type === "percent" ? "%" : dsl.exit.stopLoss.type === "points" ? "pts" : "× ATR"}
                    invalid={!!errors.find((e) => e.path === "exit.stopLoss.value")}
                    onChange={(n) => update((d) => { if (d.exit.stopLoss) d.exit.stopLoss.value = n; })} />
                )}
                {dsl.exit.stopLoss?.type === "atr" && (
                  <NumberInput label="ATR period" hideLabel value={dsl.exit.stopLoss.atrPeriod} prefix="n" step={1}
                    onChange={(n) => update((d) => { if (d.exit.stopLoss?.type === "atr") d.exit.stopLoss.atrPeriod = n; })} />
                )}
                <FieldMsg errors={errors} warnings={warnings} path="exit.stopLoss" />
                <FieldMsg errors={errors} warnings={warnings} path="exit.stopLoss.value" />
              </div>
              <PctPoints label="Target" value={dsl.exit.target} errors={errors} warnings={warnings} path="exit.target"
                onChange={(t) => update((d) => { d.exit.target = t; })} />
              <PctPoints label="Trailing stop" value={dsl.exit.trailingStop} errors={errors} warnings={warnings} path="exit.trailingStop"
                onChange={(t) => update((d) => { d.exit.trailingStop = t; })} />
              <div>
                <TimeInput label="Square off at (IST)" value={dsl.exit.squareOffAt} allowEmpty invalid={!!errors.find((e) => e.path === "exit.squareOffAt")}
                  onChange={(t) => update((d) => { d.exit.squareOffAt = t; })} />
                <FieldMsg errors={errors} warnings={warnings} path="exit.squareOffAt" />
              </div>
              {dsl.legs.length > 1 && (
                <div>
                  <Select label="Apply stop / target to" value={dsl.exit.basis}
                    options={[{ value: "combined", label: "Combined premium" }, { value: "per_leg", label: "Each leg" }]}
                    onChange={(basis) => update((d) => { d.exit.basis = basis; })} />
                  <FieldMsg errors={errors} warnings={warnings} path="exit.basis" />
                </div>
              )}
              <div className="pp-grid__wide">
                <Toggle label="Exit when the entry condition reverses" checked={dsl.exit.onOppositeSignal}
                  onChange={(b) => update((d) => { d.exit.onOppositeSignal = b; })} />
              </div>
            </div>
            <CardFooter issues={footerIssues("exit", errors)} warns={footerIssues("exit", warnings)} />
          </section>

          {/* Window */}
          <section className="panel pp-card" id="card-window">
            <CardHead n="04" title="Trading window" count={byCard("window", errors).length} />
            <div className="pp-grid">
              <div>
                <TimeInput label="New entries from (IST)" value={dsl.window.start} invalid={!!errors.find((e) => e.path === "window.start")}
                  onChange={(t) => update((d) => { d.window.start = t ?? ""; })} />
                <FieldMsg errors={errors} warnings={warnings} path="window.start" />
              </div>
              <div>
                <TimeInput label="Until (IST)" value={dsl.window.end} invalid={!!errors.find((e) => e.path === "window.end")}
                  onChange={(t) => update((d) => { d.window.end = t ?? ""; })} />
                <FieldMsg errors={errors} warnings={warnings} path="window.end" />
              </div>
              <div>
                <NumberInput label="Max trades per day" value={dsl.maxTradesPerDay} step={1} min={1} invalid={!!errors.find((e) => e.path === "maxTradesPerDay")}
                  onChange={(n) => update((d) => { d.maxTradesPerDay = n; })} />
                <FieldMsg errors={errors} warnings={warnings} path="maxTradesPerDay" />
              </div>
            </div>
            <CardFooter issues={footerIssues("window", errors)} warns={footerIssues("window", warnings)} />
          </section>

          {/* Risk */}
          <section className="panel pp-card" id="card-risk">
            <CardHead n="05" title="Size & risk" count={byCard("risk", errors).length} />
            <div className="pp-grid">
              <div className="pp-pair">
                <Select label="Position size" value={dsl.sizing.mode}
                  options={[{ value: "lots", label: "Lots" }, { value: "qty", label: "Quantity" }, { value: "capital_pct", label: "% of capital" }]}
                  invalid={!!errors.find((e) => e.path === "sizing.mode")}
                  onChange={(mode) => update((d) => { d.sizing.mode = mode; })} />
                <NumberInput label="Size" hideLabel value={dsl.sizing.value} suffix={dsl.sizing.mode === "lots" ? (props.lotSizes[dsl.instrument.symbol] ? `lots × ${props.lotSizes[dsl.instrument.symbol]}` : "lots") : dsl.sizing.mode === "qty" ? "qty" : "%"}
                  invalid={!!errors.find((e) => e.path === "sizing.value")}
                  onChange={(n) => update((d) => { d.sizing.value = n; })} />
                <FieldMsg errors={errors} warnings={warnings} path="sizing.mode" />
                <FieldMsg errors={errors} warnings={warnings} path="sizing.value" />
              </div>
              <div>
                <NumberInput label="Daily loss cap" prefix="₹" value={dsl.risk.dailyLossCap} nullable placeholder="Required" step={100}
                  invalid={!!errors.find((e) => e.path === "risk.dailyLossCap")}
                  onNull={() => update((d) => { d.risk.dailyLossCap = null; })}
                  onChange={(n) => update((d) => { d.risk.dailyLossCap = n; })} />
                <FieldMsg errors={errors} warnings={warnings} path="risk.dailyLossCap" />
              </div>
              <div>
                <NumberInput label="Max open positions" value={dsl.risk.maxOpenPositions} step={1} min={1}
                  invalid={!!errors.find((e) => e.path === "risk.maxOpenPositions")}
                  onChange={(n) => update((d) => { d.risk.maxOpenPositions = n; })} />
                <FieldMsg errors={errors} warnings={warnings} path="risk.maxOpenPositions" />
              </div>
              <div>
                <label className="tw-field">
                  <span className="tw-field__label">Mode</span>
                  <input value="Paper only" disabled readOnly />
                  <span className="tw-field__hint">Live trading unlocks after broker connect (Step 5).</span>
                </label>
              </div>
              <div className="pp-grid__wide">
                <Toggle label="Kill switch" hint="Lets you stop this strategy and close its positions instantly." checked={dsl.risk.killSwitch}
                  onChange={(b) => update((d) => { d.risk.killSwitch = b; })} />
                <FieldMsg errors={errors} warnings={warnings} path="risk.killSwitch" />
              </div>
            </div>
            <CardFooter issues={footerIssues("risk", errors)} warns={footerIssues("risk", warnings)} />
          </section>
        </>
      )}

      <details className="panel pp-json">
        <summary>Advanced: view JSON</summary>
        <p className="muted">Read-only. This exact object (schema version {dsl.schemaVersion}) is what the paper engine will run.</p>
        <pre className="mono">{JSON.stringify(dsl, null, 2)}</pre>
      </details>

      {!archived && (
        <section className="panel pp-actions">
          {editing || props.mode === "create" ? (
            <>
              {(canApprove || props.mode === "create") && (
                <Toggle label="I understand TradingWave will only paper trade this until I connect a broker" checked={confirm} onChange={setConfirm} />
              )}
              <div className="pp-actions__row">
                <button type="button" className="btn btn--accent btn--sm" disabled={!canApprove || !confirm || !!busy || !name.trim()} onClick={() => save(true)}>
                  {busy === "approve" ? "Approving\u2026" : props.mode === "create" ? "Approve" : "Save & approve"}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy || !name.trim() || (props.mode === "edit" && !dirty && !nameDirty)} onClick={() => save(false)}>
                  {busy === "draft" ? "Saving\u2026" : props.mode === "create" ? "Save as draft" : "Save as new version"}
                </button>
                {props.mode === "edit" && (
                  <button type="button" className="btn btn--ghost btn--sm" disabled={!!busy} onClick={() => { setDsl(props.initial); setName(props.name); setEditing(false); setMsg(null); }}>
                    Cancel
                  </button>
                )}
                {props.mode === "create" && props.onStartOver && (
                  <button type="button" className="pp-link" onClick={props.onStartOver}>Start over</button>
                )}
              </div>
              {errors.length > 0 && <p className="tw-field__hint">Approve unlocks when there are no errors. Warnings don&rsquo;t block it.</p>}
            </>
          ) : (
            <>
              {!props.current?.approved && (
                <Toggle label="I understand TradingWave will only paper trade this until I connect a broker" checked={confirm} onChange={setConfirm} />
              )}
              <div className="pp-actions__row">
                {!props.current?.approved && (
                  <button type="button" className="btn btn--accent btn--sm" disabled={errors.length > 0 || !confirm || !!busy} onClick={() => save(true)}>
                    {busy === "approve" ? "Approving\u2026" : `Approve version ${props.current?.version ?? ""}`}
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setEditing(true); setMsg(null); }}>
                  Edit rules
                </button>
              </div>
              {props.current?.approved && <p className="tw-field__hint">This version is approved and locked. Edits are saved as a new version.</p>}
            </>
          )}
          {msg && <p className={`tw-msg tw-msg--${msg.kind}`} role="status">{msg.text}</p>}
        </section>
      )}
    </div>
  );
}

function CardHead({ n, title, count }: { n: string; title: string; count: number }) {
  return (
    <div className="pp-card__head">
      <span className="card__n mono">{n}</span>
      <h2 className="panel__title">{title}</h2>
      {count > 0 && <span className="pp-count">{count} to fix</span>}
    </div>
  );
}

function CardFooter({ issues, warns }: { issues: Issue[]; warns: Issue[] }) {
  if (!issues.length && !warns.length) return null;
  return (
    <ul className="pp-card__issues">
      {issues.map((i) => <li key={i.path + i.code} className="is-err">{i.message}</li>)}
      {warns.map((i) => <li key={i.path + i.code} className="is-warn">{i.message}</li>)}
    </ul>
  );
}

function ValidationBadge({ errors, warnings }: { errors: number; warnings: number }) {
  if (errors === 0 && warnings === 0) return <span className="pp-badge pp-badge--ok">Checks passed</span>;
  return (
    <span className="pp-badges">
      {errors > 0 && <span className="pp-badge pp-badge--err">{errors} error{errors === 1 ? "" : "s"}</span>}
      {warnings > 0 && <span className="pp-badge pp-badge--warn">{warnings} warning{warnings === 1 ? "" : "s"}</span>}
      {errors === 0 && <span className="pp-badge pp-badge--ok">Ready to approve</span>}
    </span>
  );
}

function IssueList({ errors, warnings, linkable }: { errors: Issue[]; warnings: Issue[]; linkable?: boolean }) {
  return (
    <ul className="pp-issue-list">
      {errors.map((i) => (
        <li key={"e" + i.path + i.code} className="is-err">
          <span className="pp-issue-kind mono">Error</span>
          {linkable ? <a href={`#card-${cardOf(i.path)}`}>{i.message}</a> : <span>{i.message}</span>}
        </li>
      ))}
      {warnings.map((i) => (
        <li key={"w" + i.path + i.code} className="is-warn">
          <span className="pp-issue-kind mono">Warning</span>
          {linkable ? <a href={`#card-${cardOf(i.path)}`}>{i.message}</a> : <span>{i.message}</span>}
        </li>
      ))}
    </ul>
  );
}

function PctPoints(p: {
  label: string;
  value: { type: "percent" | "points"; value: number } | null;
  onChange: (v: { type: "percent" | "points"; value: number } | null) => void;
  errors: Issue[];
  warnings: Issue[];
  path: string;
}) {
  return (
    <div className="pp-pair">
      <Select label={p.label} value={p.value?.type ?? "none"} invalid={!!p.errors.find((e) => e.path.startsWith(p.path))}
        options={[{ value: "none", label: "None" }, { value: "percent", label: "Percent" }, { value: "points", label: "Points" }]}
        onChange={(t) => p.onChange(t === "none" ? null : { type: t, value: p.value?.value ?? Number.NaN })} />
      {p.value && (
        <NumberInput label={`${p.label} value`} hideLabel value={p.value.value} suffix={p.value.type === "percent" ? "%" : "pts"}
          invalid={!!p.errors.find((e) => e.path === `${p.path}.value`)}
          onChange={(n) => p.value && p.onChange({ ...p.value, value: n })} />
      )}
      <FieldMsg errors={p.errors} warnings={p.warnings} path={p.path} />
      <FieldMsg errors={p.errors} warnings={p.warnings} path={`${p.path}.value`} />
    </div>
  );
}

function LegRow({ i, leg, options, errors, canRemove, onChange, onRemove }: {
  i: number; leg: Leg; options: boolean; errors: Issue[]; canRemove: boolean; onChange: (l: Leg) => void; onRemove: () => void;
}) {
  const err = errors.find((e) => e.path.startsWith(`legs.${i}`));
  const strike = leg.option?.strike;
  return (
    <div className={`pp-leg${err ? " is-invalid" : ""}`}>
      <span className="pp-leg__n mono">{i + 1}</span>
      <Select compact label="Side" value={leg.side} options={[{ value: "BUY", label: "Buy" }, { value: "SELL", label: "Sell" }]} onChange={(side) => onChange({ ...leg, side })} />
      {options && (
        <>
          <Select compact label="Type" value={leg.option?.right ?? "CE"} options={[{ value: "CE", label: "Call (CE)" }, { value: "PE", label: "Put (PE)" }]}
            onChange={(right) => onChange({ ...leg, option: { right, strike: leg.option?.strike ?? { mode: "ATM" } } })} />
          <Select compact label="Strike" value={strike?.mode ?? "ATM"}
            options={[{ value: "ATM", label: "ATM" }, { value: "ITM", label: "ITM" }, { value: "OTM", label: "OTM" }, { value: "PREMIUM_NEAR", label: "Premium near" }]}
            onChange={(mode) => onChange({
              ...leg,
              option: {
                right: leg.option?.right ?? "CE",
                strike: mode === "ATM" ? { mode } : mode === "PREMIUM_NEAR" ? { mode, premium: 100 } : { mode, steps: strike && "steps" in strike ? strike.steps : 1 },
              },
            })} />
          {strike && (strike.mode === "ITM" || strike.mode === "OTM") && (
            <NumberInput compact label="Strikes away" value={strike.steps} step={1} min={1}
              onChange={(n) => leg.option && onChange({ ...leg, option: { ...leg.option, strike: { mode: strike.mode, steps: n } } })} />
          )}
          {strike?.mode === "PREMIUM_NEAR" && (
            <NumberInput compact label="Premium" prefix="₹" value={strike.premium}
              onChange={(n) => leg.option && onChange({ ...leg, option: { ...leg.option, strike: { mode: "PREMIUM_NEAR", premium: n } } })} />
          )}
        </>
      )}
      {canRemove && (
        <button type="button" className="pp-icon-btn pp-leg__rm" onClick={onRemove} aria-label={`Remove leg ${i + 1}`}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
      {err && <span className="tw-field__err pp-leg__err">{err.message}</span>}
    </div>
  );
}
