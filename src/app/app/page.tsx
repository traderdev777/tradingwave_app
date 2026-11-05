import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function Dashboard() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const waitlistCount = isAdmin ? await db.waitlistEntry.count() : 0;
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Dashboard</p>
        <h1>{`Welcome, ${firstName}.`}</h1>
        <p className="lede">
          Your workspace is ready. Strategies, paper trading and broker connections arrive in the next releases.
          Nothing here is simulated: when there is data, it will be yours.
        </p>
      </header>

      <div className="cards">
        <article className="card card--lead">
          <span className="card__n mono">01</span>
          <h2>Create your first strategy</h2>
          <p>Describe an idea in plain words and approve the rules we write from it.</p>
          <p className="card__status"><span className="dot" /> Coming in the next release (Step 3)</p>
          <Link className="card__link" href="/app/strategies">What to expect →</Link>
        </article>
        <article className="card">
          <span className="card__n mono">02</span>
          <h2>Paper trade it</h2>
          <p>Run approved strategies on live Indian market data with STT, GST and brokerage counted.</p>
          <p className="card__status"><span className="dot" /> Step 4</p>
          <Link className="card__link" href="/app/paper">What to expect →</Link>
        </article>
        <article className="card">
          <span className="card__n mono">03</span>
          <h2>Connect your broker</h2>
          <p>Link your own account through its official API. Your money never leaves your broker.</p>
          <p className="card__status"><span className="dot" /> Step 5</p>
          <Link className="card__link" href="/app/brokers">What to expect →</Link>
        </article>
      </div>

      <section className="panel">
        <h2 className="panel__title">Your account</h2>
        <dl className="kv">
          <div><dt>Name</dt><dd>{user.name}</dd></div>
          <div><dt>Email</dt><dd>{user.email}</dd></div>
          <div><dt>Role</dt><dd>{isAdmin ? "Admin" : "Member"}</dd></div>
          <div>
            <dt>Member since</dt>
            <dd className="mono">
              {user.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
            </dd>
          </div>
        </dl>
        <Link className="btn btn--ghost btn--sm" href="/app/settings">Edit settings</Link>
      </section>

      {isAdmin && (
        <section className="panel panel--row">
          <div>
            <h2 className="panel__title">Waitlist</h2>
            <p className="muted">
              <span className="mono strong">{waitlistCount.toLocaleString("en-IN")}</span>{" "}
              {waitlistCount === 1 ? "person has" : "people have"} joined from the landing page.
            </p>
          </div>
          <Link className="btn btn--ghost btn--sm" href="/app/admin/waitlist">Open waitlist</Link>
        </section>
      )}
    </div>
  );
}
