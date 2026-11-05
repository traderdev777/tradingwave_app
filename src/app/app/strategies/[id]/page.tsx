import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PassportEditor } from "@/components/strategy/PassportEditor";
import { StatusTag } from "@/components/strategy/StatusTag";
import { StrategyActions } from "@/components/strategy/StrategyActions";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { parseStrategy, type Strategy } from "@/lib/strategy/dsl";
import { diffStrategies, type FieldChange } from "@/lib/strategy/diff";
import { formatIstShort } from "@/lib/strategy/format";
import { lotSizes } from "@/lib/strategy/market";

export const metadata: Metadata = { title: "Strategy · TradingWave" };

const ENGINE_LABEL: Record<string, string> = { gemini: "Gemini", rules: "Rules engine", manual: "Edited by hand" };

export default async function StrategyDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const s = await db.strategy.findFirst({ where: { id, userId: user.id } });
  if (!s) notFound();
  const [versions, events] = await Promise.all([
    db.strategyVersion.findMany({ where: { strategyId: s.id }, orderBy: { version: "desc" } }),
    db.strategyEvent.findMany({ where: { strategyId: s.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const current = versions.find((v) => v.id === s.currentVersionId) ?? versions[0];
  if (!current) notFound();
  const parsedCur = parseStrategy(JSON.parse(current.dsl));
  const lastApproved = versions.find((v) => v.approvedAt);

  const parsed = new Map<string, Strategy | null>();
  for (const v of versions) {
    const p = parseStrategy(JSON.parse(v.dsl));
    parsed.set(v.id, p.success ? p.data : null);
  }
  const diffs = new Map<string, FieldChange[] | null>();
  versions.forEach((v, i) => {
    const prev = versions[i + 1];
    const a = prev ? parsed.get(prev.id) : null;
    const b = parsed.get(v.id);
    diffs.set(v.id, prev && a && b ? diffStrategies(a, b) : null);
  });

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow"><Link href="/app/strategies" className="crumb">Strategies</Link> / Passport</p>
        <div className="sd-title">
          <h1>{s.name}</h1>
          <StatusTag status={s.status} />
        </div>
        <p className="sd-meta mono">
          Version {current.version} · {current.approvedAt ? `approved ${formatIstShort(current.approvedAt)}` : "draft"}
          {lastApproved && !current.approvedAt ? ` · last approved: v${lastApproved.version}` : ""}
        </p>
        <StrategyActions id={s.id} archived={s.status === "ARCHIVED"} />
      </header>

      {s.status === "ARCHIVED" && <p className="pp-note">This strategy is archived. Restore it to edit or approve.</p>}

      {parsedCur.success ? (
        <PassportEditor
          key={current.id}
          mode="edit"
          strategyId={s.id}
          initial={parsedCur.data}
          lotSizes={lotSizes()}
          name={s.name}
          sourceText={current.sourceText}
          meta={{ engine: current.engine as "gemini" | "rules" | "manual" }}
          current={{ versionId: current.id, version: current.version, approved: !!current.approvedAt, archived: s.status === "ARCHIVED" }}
        />
      ) : (
        <p className="tw-alert">This version no longer matches the rule format (schema version changed). Duplicate it and re-draft.</p>
      )}

      <section className="panel sd-history" aria-label="Version history">
        <h2 className="panel__title">Version history</h2>
        <ol className="vh">
          {versions.map((v) => {
            const d = diffs.get(v.id);
            return (
              <li key={v.id} className={`vh__item${v.id === current.id ? " is-current" : ""}`}>
                <div className="vh__head">
                  <span className="vh__ver mono">v{v.version}</span>
                  {v.approvedAt ? <span className="st-tag st-tag--approved">Approved</span> : <span className="st-tag st-tag--draft">Draft</span>}
                  {v.id === current.id && <span className="vh__cur">Current</span>}
                  <span className="vh__by">{ENGINE_LABEL[v.engine] ?? v.engine}</span>
                  <time className="vh__time mono" dateTime={v.createdAt.toISOString()}>{formatIstShort(v.createdAt)}</time>
                </div>
                {d === null ? (
                  <p className="muted vh__first">First version{v.sourceText ? <>: &ldquo;{v.sourceText}&rdquo;</> : "."}</p>
                ) : d && d.length === 0 ? (
                  <p className="muted vh__first">No rule changes from v{v.version - 1}.</p>
                ) : (
                  <table className="vh__diff">
                    <thead>
                      <tr><th>Field</th><th>v{v.version - 1}</th><th>v{v.version}</th></tr>
                    </thead>
                    <tbody>
                      {d?.map((c) => (
                        <tr key={c.path}>
                          <td data-label="Field">{c.label}</td>
                          <td data-label={`v${v.version - 1}`} className="vh__old"><span>{c.before}</span></td>
                          <td data-label={`v${v.version}`} className="vh__new">{c.after}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel sd-audit" aria-label="Audit trail">
        <h2 className="panel__title">Audit trail</h2>
        <ul className="audit">
          {events.map((e) => (
            <li key={e.id}>
              <time className="mono" dateTime={e.createdAt.toISOString()}>{formatIstShort(e.createdAt)}</time>
              <span>{e.detail ?? e.type}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
