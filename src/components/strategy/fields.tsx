"use client";

import { useEffect, useState } from "react";
import type { Issue } from "@/lib/strategy/validate";

export type Opt<T extends string> = { value: T; label: string };

export async function postJson<T = Record<string, unknown>>(url: string, body: unknown): Promise<T & { ok?: boolean; error?: string; status: number }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { ok?: boolean; error?: string };
    return { ...data, status: res.status };
  } catch {
    return { ok: false, error: "Couldn\u2019t reach the server. Try again.", status: 0 } as T & { ok?: boolean; error?: string; status: number };
  }
}

export function issueFor(issues: Issue[], path: string): Issue | undefined {
  return issues.find((i) => i.path === path);
}

export function FieldMsg({ errors, warnings, path }: { errors: Issue[]; warnings: Issue[]; path: string }) {
  const e = issueFor(errors, path);
  if (e) return <span className="tw-field__err">{e.message}</span>;
  const w = issueFor(warnings, path);
  if (w) return <span className="pp-warn-text">{w.message}</span>;
  return null;
}

export function Select<T extends string>(p: {
  label: string;
  value: T;
  options: readonly Opt<T>[];
  onChange: (v: T) => void;
  invalid?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
  id?: string;
}) {
  return (
    <label className={`tw-field${p.compact ? " tw-field--compact" : ""}`}>
      <span className={p.hideLabel ? "sr-only" : "tw-field__label"}>{p.label}</span>
      <select id={p.id} value={p.value} onChange={(e) => p.onChange(e.target.value as T)} aria-invalid={p.invalid || undefined}>
        {p.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Number input that keeps what the user typed while committing a number (or NaN while empty/invalid,
 * so the validator flags it instead of us silently keeping an old value).
 */
export function NumberInput(p: {
  label: string;
  value: number | null;
  onChange: (v: number) => void;
  step?: number | "any";
  min?: number;
  suffix?: string;
  prefix?: string;
  invalid?: boolean;
  compact?: boolean;
  hideLabel?: boolean;
  nullable?: boolean;
  onNull?: () => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(p.value === null || Number.isNaN(p.value) ? "" : String(p.value));
  useEffect(() => {
    const cur = text.trim() === "" ? null : Number(text);
    if (p.value !== cur && !(p.value !== null && Number.isNaN(p.value) && (cur === null || Number.isNaN(cur)))) {
      setText(p.value === null || Number.isNaN(p.value) ? "" : String(p.value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.value]);
  return (
    <label className={`tw-field${p.compact ? " tw-field--compact" : ""}`}>
      <span className={p.hideLabel ? "sr-only" : "tw-field__label"}>{p.label}</span>
      <span className={`pp-num${p.prefix ? " has-prefix" : ""}${p.suffix ? " has-suffix" : ""}`}>
        {p.prefix && <span className="pp-num__fix pp-num__fix--pre">{p.prefix}</span>}
        <input
          inputMode="decimal"
          type="number"
          step={p.step ?? "any"}
          min={p.min}
          value={text}
          placeholder={p.placeholder}
          aria-invalid={p.invalid || undefined}
          onChange={(e) => {
            const t = e.target.value;
            setText(t);
            if (t.trim() === "" && p.nullable && p.onNull) p.onNull();
            else p.onChange(t.trim() === "" ? Number.NaN : Number(t));
          }}
        />
        {p.suffix && <span className="pp-num__fix">{p.suffix}</span>}
      </span>
    </label>
  );
}

export function TimeInput(p: { label: string; value: string | null; onChange: (v: string | null) => void; invalid?: boolean; compact?: boolean; hideLabel?: boolean; allowEmpty?: boolean }) {
  return (
    <label className={`tw-field${p.compact ? " tw-field--compact" : ""}`}>
      <span className={p.hideLabel ? "sr-only" : "tw-field__label"}>{p.label}</span>
      <input
        type="time"
        step={60}
        value={p.value ?? ""}
        aria-invalid={p.invalid || undefined}
        onChange={(e) => p.onChange(e.target.value === "" ? (p.allowEmpty ? null : "") : e.target.value.slice(0, 5))}
      />
    </label>
  );
}

export function Toggle(p: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="pp-toggle">
      <input type="checkbox" checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span>
        <span className="pp-toggle__label">{p.label}</span>
        {p.hint && <span className="tw-field__hint">{p.hint}</span>}
      </span>
    </label>
  );
}
