"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "./fields";

export function StrategyActions({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "dup" | "arch">(null);
  const [err, setErr] = useState<string | null>(null);

  async function duplicate() {
    setBusy("dup");
    setErr(null);
    const r = await postJson<{ id?: string }>(`/api/strategies/${id}/duplicate`, {});
    setBusy(null);
    if (r.status === 401) return router.replace("/login");
    if (r.ok && r.id) router.push(`/app/strategies/${r.id}`);
    else setErr(r.error ?? "Couldn\u2019t duplicate.");
  }
  async function archive() {
    if (!archived && !window.confirm("Archive this strategy? Its versions are kept and you can restore it later.")) return;
    setBusy("arch");
    setErr(null);
    const r = await postJson(`/api/strategies/${id}/archive`, { archive: !archived });
    setBusy(null);
    if (r.status === 401) return router.replace("/login");
    if (r.ok) router.refresh();
    else setErr(r.error ?? "Couldn\u2019t update.");
  }
  return (
    <div className="sd-actions">
      <button type="button" className="btn btn--ghost btn--sm" onClick={duplicate} disabled={!!busy}>
        {busy === "dup" ? "Duplicating\u2026" : "Duplicate"}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={archive} disabled={!!busy}>
        {busy === "arch" ? "Saving\u2026" : archived ? "Restore" : "Archive"}
      </button>
      {err && <p className="tw-msg tw-msg--err" role="status">{err}</p>}
    </div>
  );
}
