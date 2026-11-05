import { describe, expect, it } from "vitest";
import { describeComparison, summarize, summaryText } from "@/lib/strategy/summary";
import { diffStrategies } from "@/lib/strategy/diff";
import { clone, niftyCall } from "./fixtures/strategies";

describe("readable summary (deterministic, from the DSL)", () => {
  it("describes every part of the strategy", () => {
    const s = summarize(niftyCall());
    expect(s.headline).toBe("Buy NIFTY at-the-money call (CE) (current weekly expiry), 1 lot, on NFO.");
    expect(s.sections.map((x) => x.label)).toEqual(["Instrument", "Entry", "Exit", "Window", "Risk"]);
    const text = summaryText(niftyCall());
    expect(text).toContain("Enter when close is above VWAP and RSI(14) is above 60.");
    expect(text).toContain("Stop loss: price moves against you by 20%.");
    expect(text).toContain("Target: 40% in your favour.");
    expect(text).toContain("Square off everything at 15:10 IST.");
    expect(text).toContain("New entries only between 09:30 and 15:10 IST.");
    expect(text).toContain("Stop trading for the day after losing ₹2,000.");
    expect(text).toContain("Paper trading only. No real orders.");
  });
  it("is stable: same DSL, same words", () => {
    expect(summaryText(niftyCall())).toBe(summaryText(clone(niftyCall())));
  });
  it("names straddles, combined premium stops and missing safety values", () => {
    const s = clone(niftyCall());
    s.instrument.symbol = "BANKNIFTY";
    s.legs = [
      { side: "SELL", option: { right: "CE", strike: { mode: "ATM" } } },
      { side: "SELL", option: { right: "PE", strike: { mode: "ATM" } } },
    ];
    s.exit.basis = "combined";
    s.exit.stopLoss = { type: "percent", value: 25 };
    s.risk.dailyLossCap = null;
    const t = summaryText(s);
    expect(t).toMatch(/^Sell a BANKNIFTY ATM straddle/);
    expect(t).toContain("Stop loss: premium rises 25% on the combined premium.");
    expect(t).toContain("Daily loss cap: not set.");
  });
  it("describes time and crossover comparisons", () => {
    expect(describeComparison({ type: "compare", left: { kind: "time" }, op: ">=", right: { kind: "time_const", value: "09:20" } })).toBe("time is at or after 09:20 IST");
    expect(describeComparison({ type: "compare", left: { kind: "ema", period: 9 }, op: "crosses_above", right: { kind: "ema", period: 21 } })).toBe("EMA(9) crosses above EMA(21)");
  });
});

describe("version diff", () => {
  it("lists changed fields with readable labels", () => {
    const a = niftyCall();
    const b = clone(a);
    b.exit.stopLoss = { type: "percent", value: 30 };
    b.risk.dailyLossCap = 5000;
    b.entry.conditions.conditions.pop();
    const d = diffStrategies(a, b);
    expect(d.map((x) => x.label)).toEqual(["Entry conditions", "Stop loss", "Daily loss cap"]);
    expect(d.find((x) => x.label === "Stop loss")).toMatchObject({ before: "20%", after: "30%" });
    expect(d.find((x) => x.label === "Daily loss cap")).toMatchObject({ before: "₹2,000", after: "₹5,000" });
  });
  it("reports added legs and nothing for identical versions", () => {
    const a = niftyCall();
    expect(diffStrategies(a, clone(a))).toEqual([]);
    const b = clone(a);
    b.legs.push({ side: "BUY", option: { right: "PE", strike: { mode: "ATM" } } });
    expect(diffStrategies(a, b)).toEqual([{ path: "legs.1", label: "Leg 2", before: "none", after: "BUY PE ATM" }]);
  });
});
