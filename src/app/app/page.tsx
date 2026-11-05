import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export default async function Dashboard() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const [waitlistCount, statusCounts] = await Promise.all([
    isAdmin ? db.waitlistEntry.count() : Promise.resolve(0),
    db.strategy.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
  ]);
  const sc = (st: string) => statusCounts.find((c) => c.status === st)?._count ?? 0;
  const drafts = sc("DRAFT");
  const approved = sc("APPROVED");
  const hasStrategies = drafts + approved > 0;
  const firstName = user.name.split(/\s+/)[0];

  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Dashboard</p>
        <h1>{`Welcome, ${firstName}.`}</h1>
        <p className="lede">
          Describe a strategy in plain words and approve the rules we write from it. Paper trading and broker
          connections arrive in the next releases. Nothing here is simulated: every number is yours.
        </p>
      </header>

      <div className="cards">
        <article className="card card--lead">
          <span className="card__n mono">01</span>
          <h2>{hasStrategies ? "Your strategies" : "Create your first strategy"}</h2>
          <p>Describe an idea in plain words and approve the rules we write from it.</p>
          <p className="card__status">
            <span className="dot dot--live" />
            {`${approved} approved · ${drafts} ${drafts === 1 ? "draft" : "drafts"}`}
          </p>
          <Link className="card__link" href={hasStrategies ? "/app/strategies" : "/app/strategies/new"}>
            {hasStrategies ? "Open strategies →" : "Describe a strategy →"}
          </Link>
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
