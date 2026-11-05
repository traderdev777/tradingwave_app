import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/EmptyState";

export const metadata: Metadata = { title: "Brokers · TradingWave" };

export default function BrokersPage() {
  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Brokers</p>
        <h1>Brokers</h1>
      </header>
      <EmptyState
        step="Coming in Step 5"
        title="No broker connected"
        body="You'll connect your own SEBI-registered broker through its official API. Orders go through your broker, under your account, with your limits. Your funds never touch TradingWave."
        bullets={[
          "Starting with the most-used API brokers in India",
          "Live trading for the public runs through broker and exchange empanelment under SEBI's retail algo framework",
        ]}
      />
    </div>
  );
}
