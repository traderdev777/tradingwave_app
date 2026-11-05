import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/EmptyState";

export const metadata: Metadata = { title: "Paper trading · TradingWave" };

export default function PaperPage() {
  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Paper trading</p>
        <h1>Paper trading</h1>
      </header>
      <EmptyState
        step="Coming in Step 4"
        title="No paper trades yet"
        body="The paper engine will run your approved strategies against real NSE market data, with slippage, STT, GST and brokerage counted, so you see the bad days before your money does."
        bullets={["Real market data, not random numbers", "Indian costs included by default", "Daily loss caps enforced exactly as they will be live"]}
      />
    </div>
  );
}
