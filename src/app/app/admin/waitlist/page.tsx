import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { waitlistWhere } from "@/lib/waitlist-query";

export const metadata: Metadata = { title: "Waitlist · Admin · TradingWave" };

const PAGE_SIZE = 50;

export default async function WaitlistAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const where = waitlistWhere(q);

  const [total, filtered, rows] = await Promise.all([
    db.waitlistEntry.count(),
    db.waitlistEntry.count({ where }),
    db.waitlistEntry.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE }),
  ]);
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const csvHref = `/api/admin/waitlist.csv${q ? `?q=${encodeURIComponent(q)}` : ""}`;
  const qs = (p: number) => `?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`;
  const fmt = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata",
  });

  return (
    <div className="page">
      <header className="page__head page__head--row">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>Waitlist</h1>
          <p className="muted">
            <span className="mono strong">{total.toLocaleString("en-IN")}</span> total
            {q && <> · <span className="mono strong">{filtered.toLocaleString("en-IN")}</span> matching “{q}”</>}
          </p>
        </div>
        <a className="btn btn--ghost btn--sm" href={csvHref} download>
          Export CSV
        </a>
      </header>

      <form className="search" role="search" method="get">
        <input type="search" name="q" defaultValue={q} placeholder="Search name, email, phone, broker or market" aria-label="Search waitlist" maxLength={100} />
        <button className="btn btn--accent btn--sm" type="submit">Search</button>
        {q && <Link className="search__clear" href="/app/admin/waitlist">Clear</Link>}
      </form>

      {rows.length === 0 ? (
        <section className="empty">
          <h2>{q ? "No one matches that search" : "No sign-ups yet"}</h2>
          <p>{q ? "Try a different name, email or broker." : "Entries from the landing page form will appear here as soon as people join."}</p>
        </section>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Joined (IST)</th><th>Name</th><th>Email</th><th>Mobile</th><th>Broker</th><th>Market</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td data-label="Joined (IST)" className="mono nowrap">{fmt.format(r.createdAt)}</td>
                  <td data-label="Name">{r.name}</td>
                  <td data-label="Email" className="break">{r.email}</td>
                  <td data-label="Mobile" className="mono nowrap">{r.phone ?? <span className="muted">—</span>}</td>
                  <td data-label="Broker">{r.broker ?? <span className="muted">—</span>}</td>
                  <td data-label="Market">{r.market ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="Pages">
          {page > 1 ? <Link href={qs(page - 1)}>← Newer</Link> : <span />}
          <span className="mono muted">Page {page} of {pages}</span>
          {page < pages ? <Link href={qs(page + 1)}>Older →</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
