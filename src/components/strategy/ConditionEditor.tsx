"use client";

import {
  COMPARE_OPS,
  defaultOperand,
  type Comparison,
  type CompareOp,
  type ConditionGroup,
  type Operand,
  type OperandKind,
} from "@/lib/strategy/dsl";
import type { Issue } from "@/lib/strategy/validate";
import { NumberInput, Select, TimeInput, type Opt } from "./fields";

const KIND_OPTS: Opt<OperandKind>[] = [
  { value: "price", label: "Price" },
  { value: "vwap", label: "VWAP" },
  { value: "ema", label: "EMA" },
  { value: "sma", label: "SMA" },
  { value: "rsi", label: "RSI" },
  { value: "macd", label: "MACD" },
  { value: "bollinger", label: "Bollinger" },
  { value: "atr", label: "ATR" },
  { value: "supertrend", label: "Supertrend" },
  { value: "prev_day", label: "Previous day" },
  { value: "opening_range", label: "Opening range" },
  { value: "const", label: "Number" },
  { value: "time", label: "Time of day" },
  { value: "time_const", label: "Clock time" },
];

const OP_LABELS: Record<CompareOp, string> = {
  ">": "is above",
  ">=": "is at or above",
  "<": "is below",
  "<=": "is at or below",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
};
const OP_OPTS: Opt<CompareOp>[] = COMPARE_OPS.map((o) => ({ value: o, label: OP_LABELS[o] }));

type Props = {
  group: ConditionGroup;
  onChange: (g: ConditionGroup) => void;
  path: string;
  errors: Issue[];
  depth?: number;
  onRemove?: () => void;
};

export function ConditionEditor({ group, onChange, path, errors, depth = 1, onRemove }: Props) {
  const setAt = (i: number, c: Comparison | ConditionGroup) => onChange({ ...group, conditions: group.conditions.map((x, j) => (j === i ? c : x)) });
  const removeAt = (i: number) => onChange({ ...group, conditions: group.conditions.filter((_, j) => j !== i) });
  const add = (c: Comparison | ConditionGroup) => onChange({ ...group, conditions: [...group.conditions, c] });
  const groupErr = errors.find((e) => e.path === path);

  return (
    <div className={`cond-group cond-group--d${depth}`}>
      <div className="cond-group__head">
        <Select
          compact
          label={depth === 1 ? "Enter when" : "Group"}
          value={group.logic}
          options={[
            { value: "AND", label: "All of these are true (AND)" },
            { value: "OR", label: "Any of these is true (OR)" },
          ]}
          onChange={(logic) => onChange({ ...group, logic })}
        />
        {onRemove && (
          <button type="button" className="pp-icon-btn" onClick={onRemove} aria-label="Remove group">
            Remove group
          </button>
        )}
      </div>
      {group.conditions.length === 0 && <p className="muted cond-empty">No conditions yet.</p>}
      <ol className="cond-list">
        {group.conditions.map((c, i) => {
          const p = `${path}.conditions.${i}`;
          return (
            <li key={i} className="cond-item">
              {i > 0 && <span className="cond-join mono">{group.logic}</span>}
              {c.type === "compare" ? (
                <ComparisonRow c={c} onChange={(n) => setAt(i, n)} onRemove={() => removeAt(i)} error={errors.find((e) => e.path === p || e.path.startsWith(p + "."))} />
              ) : (
                <ConditionEditor group={c} onChange={(n) => setAt(i, n)} path={p} errors={errors} depth={depth + 1} onRemove={() => removeAt(i)} />
              )}
            </li>
          );
        })}
      </ol>
      <div className="cond-add">
        <button type="button" className="btn btn--ghost btn--xs" onClick={() => add({ type: "compare", left: defaultOperand("price"), op: ">", right: defaultOperand("vwap") })}>
          + Condition
        </button>
        {depth < 3 && (
          <button type="button" className="btn btn--ghost btn--xs" onClick={() => add({ type: "group", logic: group.logic === "AND" ? "OR" : "AND", conditions: [] })}>
            + Group
          </button>
        )}
      </div>
      {groupErr && <span className="tw-field__err">{groupErr.message}</span>}
    </div>
  );
}

function ComparisonRow({ c, onChange, onRemove, error }: { c: Comparison; onChange: (c: Comparison) => void; onRemove: () => void; error?: Issue }) {
  return (
    <div className={`cond-row${error ? " is-invalid" : ""}`}>
      <div className="cond-row__parts">
        <OperandEditor label="Left side" value={c.left} onChange={(left) => onChange({ ...c, left })} />
        <Select compact hideLabel label="Comparison" value={c.op} options={OP_OPTS} onChange={(op) => onChange({ ...c, op })} />
        <OperandEditor label="Right side" value={c.right} onChange={(right) => onChange({ ...c, right })} />
      </div>
      <button type="button" className="pp-icon-btn" onClick={onRemove} aria-label="Remove condition">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
      {error && <span className="tw-field__err cond-row__err">{error.message}</span>}
    </div>
  );
}

export function OperandEditor({ label, value, onChange }: { label: string; value: Operand; onChange: (o: Operand) => void }) {
  const o = value;
  return (
    <div className="operand" role="group" aria-label={label}>
      <Select compact hideLabel label={`${label}: type`} value={o.kind} options={KIND_OPTS} onChange={(k) => onChange(defaultOperand(k))} />
      {o.kind === "price" && (
        <Select compact hideLabel label={`${label}: field`} value={o.field} onChange={(field) => onChange({ ...o, field })}
          options={[{ value: "close", label: "close" }, { value: "open", label: "open" }, { value: "high", label: "high" }, { value: "low", label: "low" }, { value: "ltp", label: "LTP" }]} />
      )}
      {(o.kind === "ema" || o.kind === "sma" || o.kind === "rsi" || o.kind === "atr") && (
        <NumberInput compact hideLabel label={`${label}: period`} value={o.period} step={1} min={1} prefix="n" onChange={(period) => onChange({ ...o, period })} />
      )}
      {o.kind === "macd" && (
        <>
          <NumberInput compact hideLabel label="MACD fast" value={o.fast} step={1} prefix="f" onChange={(fast) => onChange({ ...o, fast })} />
          <NumberInput compact hideLabel label="MACD slow" value={o.slow} step={1} prefix="s" onChange={(slow) => onChange({ ...o, slow })} />
          <NumberInput compact hideLabel label="MACD signal" value={o.signal} step={1} prefix="sig" onChange={(signal) => onChange({ ...o, signal })} />
          <Select compact hideLabel label="MACD line" value={o.line} onChange={(line) => onChange({ ...o, line })}
            options={[{ value: "macd", label: "line" }, { value: "signal", label: "signal" }, { value: "hist", label: "histogram" }]} />
        </>
      )}
      {o.kind === "bollinger" && (
        <>
          <NumberInput compact hideLabel label="Bollinger period" value={o.period} step={1} prefix="n" onChange={(period) => onChange({ ...o, period })} />
          <NumberInput compact hideLabel label="Bollinger std dev" value={o.stddev} step={0.5} prefix="k" onChange={(stddev) => onChange({ ...o, stddev })} />
          <Select compact hideLabel label="Bollinger band" value={o.band} onChange={(band) => onChange({ ...o, band })}
            options={[{ value: "upper", label: "upper" }, { value: "middle", label: "middle" }, { value: "lower", label: "lower" }]} />
        </>
      )}
      {o.kind === "supertrend" && (
        <>
          <NumberInput compact hideLabel label="Supertrend period" value={o.period} step={1} prefix="n" onChange={(period) => onChange({ ...o, period })} />
          <NumberInput compact hideLabel label="Supertrend multiplier" value={o.multiplier} step={0.5} prefix="m" onChange={(multiplier) => onChange({ ...o, multiplier })} />
        </>
      )}
      {o.kind === "prev_day" && (
        <Select compact hideLabel label="Previous day field" value={o.field} onChange={(field) => onChange({ ...o, field })}
          options={[{ value: "high", label: "high" }, { value: "low", label: "low" }, { value: "close", label: "close" }]} />
      )}
      {o.kind === "opening_range" && (
        <>
          <NumberInput compact hideLabel label="Opening range minutes" value={o.minutes} step={1} suffix="min" onChange={(minutes) => onChange({ ...o, minutes })} />
          <Select compact hideLabel label="Opening range side" value={o.field} onChange={(field) => onChange({ ...o, field })}
            options={[{ value: "high", label: "high" }, { value: "low", label: "low" }]} />
        </>
      )}
      {o.kind === "const" && <NumberInput compact hideLabel label={`${label}: value`} value={o.value} onChange={(v) => onChange({ ...o, value: v })} />}
      {o.kind === "time_const" && <TimeInput compact hideLabel label={`${label}: time`} value={o.value} onChange={(v) => onChange({ ...o, value: v ?? "" })} />}
    </div>
  );
}
