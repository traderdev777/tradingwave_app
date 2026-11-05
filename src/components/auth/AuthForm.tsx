"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

type Mode = "login" | "signup";
type ApiResult = { ok?: boolean; error?: string; fields?: Record<string, string> };

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [showPw, setShowPw] = useState(false);

  const next = params.get("next");
  const target = next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app";

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const fd = new FormData(ev.currentTarget);
    const body = Object.fromEntries(fd.entries());
    setBusy(true);
    setError("");
    setFields({});
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as ApiResult;
      if (res.ok && data.ok) {
        router.replace(target);
        router.refresh();
        return;
      }
      setFields(data.fields ?? {});
      setError(data.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Couldn\u2019t reach the server. Check your connection and try again.");
    }
    setBusy(false);
  }

  const isSignup = mode === "signup";
  return (
    <div className="auth__card">
      <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="lede">
        {isSignup
          ? "Start with paper trading. Live trading comes later, on your own broker."
          : "Sign in to your TradingWave workspace."}
      </p>

      <form className="tw-form" onSubmit={onSubmit} noValidate>
        {isSignup && (
          <Field label="Name" error={fields.name}>
            <input name="name" autoComplete="name" required maxLength={80} aria-invalid={!!fields.name} />
          </Field>
        )}
        <Field label="Email" error={fields.email}>
          <input name="email" type="email" autoComplete="email" required maxLength={254} aria-invalid={!!fields.email} />
        </Field>
        <Field
          label="Password"
          error={fields.password}
          hint={isSignup ? "At least 10 characters, with a letter and a number." : undefined}
        >
          <div className="pw">
            <input
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 10 : 1}
              maxLength={72}
              aria-invalid={!!fields.password}
            />
            <button type="button" className="pw__toggle" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </Field>

        <p className="tw-alert" role="alert" hidden={!error || Object.keys(fields).length > 0}>
          {error}
        </p>

        <button className="btn btn--accent btn--block" type="submit" disabled={busy}>
          {busy ? (isSignup ? "Creating account\u2026" : "Signing in\u2026") : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="auth__switch">
        {isSignup ? (
          <>Already have an account? <Link href="/login">Sign in</Link></>
        ) : (
          <>New to TradingWave? <Link href="/signup">Create an account</Link></>
        )}
      </p>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="tw-field">
      <span className="tw-field__label">{label}</span>
      {children}
      {error ? <span className="tw-field__err">{error}</span> : hint ? <span className="tw-field__hint">{hint}</span> : null}
    </label>
  );
}
