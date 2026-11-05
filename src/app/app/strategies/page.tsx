import type { Metadata } from "next";
import { EmptyState } from "@/components/shell/EmptyState";

export const metadata: Metadata = { title: "Strategies · TradingWave" };

export default function StrategiesPage() {
  return (
    <div className="page">
      <header className="page__head">
        <p className="eyebrow">Strategies</p>
        <h1>Strategies</h1>
      </header>
      <EmptyState
        step="Coming in Step 3"
        title="You haven't created a strategy yet"
        body="The strategy compiler is the next release. You'll describe an idea in plain words and get back a Strategy Passport: readable rules you can edit and approve."
        bullets={[
          "Write in English, with Hindi, Kannada, Tamil and Telugu to follow",
          "Every rule and number visible, nothing hidden",
          "Each edit saved as a new version",
        ]}
      />
    </div>
  );
}
