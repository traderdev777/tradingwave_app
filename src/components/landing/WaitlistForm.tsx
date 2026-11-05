"use client";

import { useState, type FormEvent } from "react";
import { BROKERS, MARKETS } from "@/lib/options";

type Status = { kind: "idle" | "ok" | "err"; text: string };

export function WaitlistForm() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle", text: "" });
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const form = ev.currentTarget;
    const fd = new FormData(form);
    const name = String(fd.get("name") ?? "").trim();
    const email = String(fd.get("email") ?? "").trim();
    const bad = { name: !name, email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) };
    setInvalid(bad);
    if (bad.name || bad.email) {
      setStatus({ kind: "err", text: "Please add your name and a valid email." });
      return;
    }
    setBusy(true);
    setStatus({ kind: "idle", text: "" });
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: fd.get("phone"),
          broker: fd.get("broker"),
          market: fd.get("market"),
          botcheck: fd.get("botcheck") ? "on" : undefined,
          source: "landing",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean; message?: string; error?: string; fields?: Record<string, string>;
      };
      if (res.ok && data.ok) {
        setStatus({ kind: "ok", text: data.message ?? "You\u2019re on the list. We\u2019ll be in touch soon." });
        form.reset();
        setInvalid({});
      } else {
        if (data.fields) setInvalid(Object.fromEntries(Object.keys(data.fields).map((k) => [k, true])));
        setStatus({ kind: "err", text: data.error ?? "Something went wrong. Please try again in a minute." });
      }
    } catch {
      setStatus({ kind: "err", text: "Couldn\u2019t reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" id="waitlist" noValidate onSubmit={onSubmit}>
      <label>
        Name
        <input name="name" autoComplete="name" required maxLength={80} aria-invalid={invalid.name ? "true" : "false"} />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={invalid.email ? "true" : "false"} />
      </label>
      <label>
        <span>
          Mobile <span className="opt">(optional)</span>
        </span>
        <input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+91" maxLength={20} aria-invalid={invalid.phone ? "true" : "false"} />
      </label>
      <div className="row2">
        <label>
          Your broker
          <select name="broker" defaultValue="">
            <option value="">Select</option>
            {BROKERS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <label>
          I mostly trade
          <select name="market" defaultValue="">
            <option value="">Select</option>
            {MARKETS.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
      </div>
      <input type="checkbox" name="botcheck" className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
      <button className="btn btn--accent btn--block" type="submit" disabled={busy}>
        {busy ? "Joining\u2026" : "Join the waitlist"}
      </button>
      <p className={`form__msg ${status.kind === "idle" ? "" : status.kind}`} id="formMsg" role="status">
        {status.text}
      </p>
      <p className="fine">We&apos;ll only email you about TradingWave. No tips, no spam.</p>
    </form>
  );
}
