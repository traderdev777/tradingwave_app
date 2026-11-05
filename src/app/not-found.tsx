import Link from "next/link";

export default function NotFound() {
  return (
    <main className="nf">
      <p className="eyebrow">404</p>
      <h1>This page isn&apos;t here.</h1>
      <p className="lede">The link may be old, or the page hasn&apos;t been built yet.</p>
      <Link className="btn btn--ghost" href="/">Back to TradingWave</Link>
    </main>
  );
}
