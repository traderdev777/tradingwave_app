import type { Metadata } from "next";
import Link from "next/link";
import { StrategyBuilder } from "@/components/strategy/StrategyBuilder";
import { requireUser } from "@/lib/session";
import { lotSizes } from "@/lib/strategy/market";

export const metadata: Metadata = { title: "New strategy · TradingWave" };

export default async function NewStrategyPage() {
  await requireUser();
  const geminiEnabled = !!process.env.GEMINI_API_KEY?.trim();
  return (
    <div className="page page--narrow">
      <header className="page__head">
        <p className="eyebrow"><Link href="/app/strategies" className="crumb">Strategies</Link> / New</p>
        <h1>Say it. Read it.</h1>
        <p className="lede">Describe the trade in your own words. We draft the rules, you check every one, then approve it for paper trading.</p>
      </header>
      <StrategyBuilder geminiEnabled={geminiEnabled} lotSizes={lotSizes()} />
    </div>
  );
}
