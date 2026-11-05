"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Msg = { kind: "ok" | "err"; text: string } | null;
type ApiResult = { ok?: boolean; error?: string; message?: string; fields?: Record<string, string> };

async function post(url: string, body: unknown): Promise<ApiResult & { status: number }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ApiResult;
    return { ...data, status: res.status };
  } catch {
    return { ok: false, error: "Couldn\u2019t reach the server. Try again.", status: 0 };
  }
}

export function ProfileForm({ initialName, email }: { initialName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [err, setErr] = useState<string | undefined>();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    setErr(undefined);
    const r = await post("/api/account/profile", { name });
    setBusy(false);
    if (r.status === 401) return router.replace("/login");
    if (r.ok) {
      setMsg({ kind: "ok", text: r.message ?? "Saved." });
      router.refresh();
    } else {
      setErr(r.fields?.name);
      setMsg({ kind: "err", text: r.error ?? "Couldn\u2019t save." });
    }
  }

  return (
    <form className="tw-form" onSubmit={onSubmit} noValidate>
      <label className="tw-field">
        <span className="tw-field__label">Name</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" aria-invalid={!!err} />
        {err && <span className="tw-field__err">{err}</span>}
      </label>
      <label className="tw-field">
        <span className="tw-field__label">Email</span>
        <input value={email} disabled readOnly />
        <span className="tw-field__hint">Changing your email will come with email verification in a later release.</span>
      </label>
      <div className="tw-form__row">
        <button className="btn btn--accent btn--sm" type="submit" disabled={busy || name.trim() === initialName}>
          {busy ? "Saving\u2026" : "Save name"}
        </button>
        {msg && <p className={`tw-msg tw-msg--${msg.kind}`} role="status">{msg.text}</p>}
      </div>
    </form>
  );
}

export function PasswordForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const currentPassword = String(fd.get("currentPassword") ?? "");
    const newPassword = String(fd.get("newPassword") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    setMsg(null);
    setFields({});
    if (newPassword !== confirm) {
      setFields({ confirm: "The two new passwords don't match." });
      return;
    }
    setBusy(true);
    const r = await post("/api/account/password", { currentPassword, newPassword });
    setBusy(false);
    if (r.status === 401) return router.replace("/login");
    if (r.ok) {
      form.reset();
      setMsg({ kind: "ok", text: r.message ?? "Password changed." });
    } else {
      setFields(r.fields ?? {});
      setMsg({ kind: "err", text: r.error ?? "Couldn\u2019t change your password." });
    }
  }

  return (
    <form className="tw-form" onSubmit={onSubmit} noValidate>
      <PwField name="currentPassword" label="Current password" autoComplete="current-password" error={fields.currentPassword} />
      <PwField name="newPassword" label="New password" autoComplete="new-password" error={fields.newPassword} hint="At least 10 characters, with a letter and a number." />
      <PwField name="confirm" label="Confirm new password" autoComplete="new-password" error={fields.confirm} />
      <div className="tw-form__row">
        <button className="btn btn--accent btn--sm" type="submit" disabled={busy}>
          {busy ? "Updating\u2026" : "Change password"}
        </button>
        {msg && <p className={`tw-msg tw-msg--${msg.kind}`} role="status">{msg.text}</p>}
      </div>
    </form>
  );
}

function PwField(p: { name: string; label: string; autoComplete: string; error?: string; hint?: string }) {
  return (
    <label className="tw-field">
      <span className="tw-field__label">{p.label}</span>
      <input name={p.name} type="password" autoComplete={p.autoComplete} maxLength={72} required aria-invalid={!!p.error} />
      {p.error ? <span className="tw-field__err">{p.error}</span> : p.hint ? <span className="tw-field__hint">{p.hint}</span> : null}
    </label>
  );
}
