import type { Strategy } from "./dsl";
import { describeGroup } from "./summary";

/** Field-level differences between two versions, in readable labels. Pure. */
export type FieldChange = { path: string; label: string; before: string; after: string };

const LABELS: Record<string, string> = {
  "instrument.exchange": "Exchange",
  "instrument.symbol": "Symbol",
  "instrument.segment": "Segment",
  "instrument.expiry": "Expiry",
  timeframe: "Timeframe",
  "entry.conditions": "Entry conditions",
  "exit.stopLoss": "Stop loss",
  "exit.target": "Target",
  "exit.trailingStop": "Trailing stop",
  "exit.squareOffAt": "Square-off time",
  "exit.onOppositeSignal": "Exit on opposite signal",
  "exit.basis": "Exit basis",
  "window.start": "Window start",
  "window.end": "Window end",
  maxTradesPerDay: "Max trades per day",
  sizing: "Position size",
  "risk.dailyLossCap": "Daily loss cap",
  "risk.maxOpenPositions": "Max open positions",
  "risk.killSwitch": "Kill switch",
  mode: "Mode",
};

function flatten(s: Strategy): Record<string, string> {
  const unit = (t: string) => (t === "percent" ? "%" : t === "points" ? " pts" : "");
  const sl = s.exit.stopLoss;
  const out: Record<string, string> = {
    "instrument.exchange": s.instrument.exchange,
    "instrument.symbol": s.instrument.symbol,
    "instrument.segment": s.instrument.segment,
    "instrument.expiry": s.instrument.expiry ? `${s.instrument.expiry.which} ${s.instrument.expiry.cycle}` : "none",
    timeframe: s.timeframe,
    "entry.conditions": describeGroup(s.entry.conditions),
    "exit.stopLoss": !sl ? "none" : sl.type === "atr" ? `${sl.value}× ATR(${sl.atrPeriod})` : `${sl.value}${unit(sl.type)}`,
    "exit.target": s.exit.target ? `${s.exit.target.value}${unit(s.exit.target.type)}` : "none",
    "exit.trailingStop": s.exit.trailingStop ? `${s.exit.trailingStop.value}${unit(s.exit.trailingStop.type)}` : "none",
    "exit.squareOffAt": s.exit.squareOffAt ?? "none",
    "exit.onOppositeSignal": s.exit.onOppositeSignal ? "yes" : "no",
    "exit.basis": s.exit.basis === "combined" ? "combined premium" : "each leg",
    "window.start": s.window.start,
    "window.end": s.window.end,
    maxTradesPerDay: String(s.maxTradesPerDay),
    sizing: s.sizing.mode === "lots" ? `${s.sizing.value} lots` : s.sizing.mode === "qty" ? `qty ${s.sizing.value}` : `${s.sizing.value}% of capital`,
    "risk.dailyLossCap": s.risk.dailyLossCap === null ? "none" : `₹${s.risk.dailyLossCap.toLocaleString("en-IN")}`,
    "risk.maxOpenPositions": String(s.risk.maxOpenPositions),
    "risk.killSwitch": s.risk.killSwitch ? "on" : "off",
    mode: s.mode,
  };
  const legCount = Math.max(s.legs.length, 1);
  for (let i = 0; i < legCount; i++) {
    const l = s.legs[i];
    if (!l) continue;
    const o = l.option;
    const strike = !o ? "" : o.strike.mode === "ATM" ? " ATM" : o.strike.mode === "PREMIUM_NEAR" ? ` premium≈₹${o.strike.premium}` : ` ${o.strike.mode} ${o.strike.steps}`;
    out[`legs.${i}`] = `${l.side}${o ? ` ${o.right}${strike}` : ""}`;
  }
  return out;
}

export function diffStrategies(before: Strategy, after: Strategy): FieldChange[] {
  const a = flatten(before);
  const b = flatten(after);
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  const changes: FieldChange[] = [];
  for (const k of keys) {
    const x = a[k] ?? "none";
    const y = b[k] ?? "none";
    if (x !== y) changes.push({ path: k, label: LABELS[k] ?? (k.startsWith("legs.") ? `Leg ${Number(k.split(".")[1]) + 1}` : k), before: x, after: y });
  }
  return changes;
}
