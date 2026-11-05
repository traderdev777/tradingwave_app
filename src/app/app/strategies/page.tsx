import type { Metadata } from "next";
import Link from "next/link";
import { StatusTag } from "@/components/strategy/StatusTag";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatIstShort, relativeFrom } from "@/lib/strategy/format";

export const metadata: Metadata = { title: "Strategies · TradingWave" };

export default async function StrategiesPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requireUser();
  const { show } = await searchParams;
  const showArchived = show === "archived";
  const [rows, counts] = await Promise.all([
    db.strategy.findMany({
      where: { userId: user.id, status: showArchived ? "ARCHIVED" : { not: "ARCHIVED" } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, summary: true, engine: true } } },
    }),
    db.strategy.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const total = count("DRAFT") + count("APPROVED");
  const now = new Date();

  return (
    <div className="page">
      <header className="page__head page__head--row">
        <div>
          <p className="eyebrow">Strategies</p>
          <h1>Strategies</h1>
          <p className="lede">Describe an idea in plain words, check the rules we write from it, then approve it for paper trading.</p>
        </div>
        <Link className="btn btn--accent btn--sm" href="/app/strategies/new">New strategy</Link>
      </header>

      {total === 0 && !showArchived ? (
        <section className="empty">
          <span className="tw-tag tw-tag--paper">Paper trading only</span>
          <h2>Describe your first strategy</h2>
          <p>Write it the way you&rsquo;d explain it to a friend. We turn it into a Strategy Passport: readable rules you can edit, check and approve. Nothing trades until you approve it, and then only on paper.</p>
          <ul className="empty__list">
            <li>Every rule and number visible, nothing hidden</li>
            <li>India-specific checks: market hours, lot sizes, expiries, stop loss and daily loss cap</li>
            <li>Every edit saved as a new version</li>
          </ul>
          <Link className="btn btn--accent btn--sm" href="/app/strategies/new">Describe your first strategy</Link>
          {count("ARCHIVED") > 0 && <Link className="search__clear" href="/app/strategies?show=archived">View {count("ARCHIVED")} archived</Link>}
        </section>
      ) : (
        <>
          <div className="st-filter" role="tablist" aria-label="Filter">
            <Link role="tab" aria-selected={!showArchived} className={!showArchived ? "is-active" : ""} href="/app/strategies">
              Active <span className="mono">{total}</span>
            </Link>
            <Link role="tab" aria-selected={showArchived} className={showArchived ? "is-active" : ""} href="/app/strategies?show=archived">
              Archived <span className="mono">{count("ARCHIVED")}</span>
            </Link>
          </div>
          {rows.length === 0 ? (
            <p className="muted">Nothing archived.</p>
          ) : (
            <ul className="st-list">
              {rows.map((s) => {
                const v = s.versions[0];
                return (
                  <li key={s.id}>
                    <Link href={`/app/strategies/${s.id}`} className="st-row">
                      <span className="st-row__main">
                        <span className="st-row__name">{s.name}</span>
                        <span className="st-row__sum">{v?.summary.split("\n")[0] ?? ""}</span>
                      </span>
                      <span className="st-row__meta">
                        <StatusTag status={s.status} />
                        <span className="mono st-row__ver">v{v?.version ?? 0}</span>
                        <span className="st-row__time" title={formatIstShort(s.updatedAt)}>Edited {relativeFrom(s.updatedAt, now)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
