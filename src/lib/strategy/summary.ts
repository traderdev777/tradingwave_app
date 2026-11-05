import type { Comparison, Condition, ConditionGroup, Leg, Operand, Strategy } from "./dsl";
import { STRIKE_STEPS } from "./market";

/**
 * Plain-English description generated deterministically FROM the DSL.
 * The language model never writes this: what the user reads is exactly what will run.
 */
export type Summary = { headline: string; sections: { label: string; lines: string[] }[] };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-IN", { maximumFractionDigits: 4 });

export function describeOperand(o: Operand): string {
  switch (o.kind) {
    case "price": return o.field === "ltp" ? "last traded price" : `${o.field}`;
    case "vwap": return "VWAP";
    case "sma": return `SMA(${o.period})`;
    case "ema": return `EMA(${o.period})`;
    case "rsi": return `RSI(${o.period})`;
    case "macd": return `MACD(${o.fast},${o.slow},${o.signal}) ${o.line === "macd" ? "line" : o.line === "signal" ? "signal line" : "histogram"}`;
    case "bollinger": return `Bollinger(${o.period}, ${num(o.stddev)}) ${o.band} band`;
    case "atr": return `ATR(${o.period})`;
    case "supertrend": return `Supertrend(${o.period}, ${num(o.multiplier)})`;
    case "prev_day": return `previous day's ${o.field}`;
    case "opening_range": return `${o.minutes}-min opening range ${o.field}`;
    case "const": return num(o.value);
    case "time": return "time";
    case "time_const": return `${o.value} IST`;
  }
}

const OP_WORDS: Record<Comparison["op"], string> = {
  ">": "is above",
  ">=": "is at or above",
  "<": "is below",
  "<=": "is at or below",
  crosses_above: "crosses above",
  crosses_below: "crosses below",
};

export function describeComparison(c: Comparison): string {
  if (c.left.kind === "time" && c.right.kind === "time_const") {
    const w = c.op === ">" ? "after" : c.op === ">=" ? "at or after" : c.op === "<" ? "before" : c.op === "<=" ? "at or before" : OP_WORDS[c.op];
    return `time is ${w} ${c.right.value} IST`;
  }
  return `${describeOperand(c.left)} ${OP_WORDS[c.op]} ${describeOperand(c.right)}`;
}

export function describeGroup(g: ConditionGroup, nested = false): string {
  const parts = g.conditions.map((c: Condition) => (c.type === "compare" ? describeComparison(c) : describeGroup(c, true)));
  if (parts.length === 0) return "(no conditions)";
  const joined = parts.join(g.logic === "AND" ? " and " : " or ");
  return nested && parts.length > 1 ? `(${joined})` : joined;
}

function describeStrike(leg: Leg, symbol: string): string {
  if (!leg.option) return "";
  const s = leg.option.strike;
  const step = STRIKE_STEPS[symbol];
  const right = leg.option.right === "CE" ? "call (CE)" : "put (PE)";
  switch (s.mode) {
    case "ATM": return `at-the-money ${right}`;
    case "ITM": return `${s.steps} strike${s.steps > 1 ? "s" : ""} in-the-money${step ? ` (${s.steps * step} pts)` : ""} ${right}`;
    case "OTM": return `${s.steps} strike${s.steps > 1 ? "s" : ""} out-of-the-money${step ? ` (${s.steps * step} pts)` : ""} ${right}`;
    case "PREMIUM_NEAR": return `${right} with premium nearest ${inr(s.premium)}`;
  }
}

const TF_WORDS: Record<Strategy["timeframe"], string> = {
  "1m": "1-minute", "3m": "3-minute", "5m": "5-minute", "15m": "15-minute", "30m": "30-minute", "1h": "1-hour", "1d": "daily",
};

export function summarize(s: Strategy): Summary {
  const { exchange, symbol, segment, expiry } = s.instrument;
  const exp = expiry ? `${expiry.which} ${expiry.cycle} expiry` : "";
  const sizing =
    s.sizing.mode === "lots" ? `${num(s.sizing.value)} lot${s.sizing.value === 1 ? "" : "s"}`
    : s.sizing.mode === "qty" ? `${num(s.sizing.value)} qty`
    : `${num(s.sizing.value)}% of capital`;

  const legDescs = s.legs.map((l) =>
    segment === "options" ? `${l.side === "BUY" ? "Buy" : "Sell"} ${symbol} ${describeStrike(l, symbol)}` : `${l.side === "BUY" ? "Buy" : "Sell"} ${symbol}${segment === "futures" ? " futures" : ""}`,
  );
  const isStraddle = s.legs.length === 2 && s.legs[0]?.side === s.legs[1]?.side &&
    s.legs.every((l) => l.option?.strike.mode === "ATM") && new Set(s.legs.map((l) => l.option?.right)).size === 2;
  const headline = isStraddle
    ? `${s.legs[0]?.side === "SELL" ? "Sell" : "Buy"} a ${symbol} ATM straddle (${exp}), ${sizing} per leg, on ${exchange}.`
    : `${legDescs.join(" + ")}${exp ? ` (${exp})` : ""}, ${sizing}${s.legs.length > 1 ? " per leg" : ""}, on ${exchange}.`;

  const instrument = [
    `${exchange} · ${segment === "cash" ? "cash / spot" : segment}${exp ? ` · ${exp}` : ""}`,
    ...(s.legs.length > 1 ? legDescs.map((d, i) => `Leg ${i + 1}: ${d}`) : []),
    `Signals on ${TF_WORDS[s.timeframe]} candles.`,
  ];
  if (exchange === "CRYPTO") instrument.push("Via an FIU-IND registered exchange only.");

  const entry = [`Enter when ${describeGroup(s.entry.conditions)}.`];

  const exit: string[] = [];
  const basis = s.legs.length > 1 ? (s.exit.basis === "combined" ? " on the combined premium" : " on each leg") : "";
  const sold = s.legs.every((l) => l.side === "SELL");
  const sl = s.exit.stopLoss;
  if (sl) {
    exit.push(
      sl.type === "percent" ? `Stop loss: ${sold ? "premium rises" : "price moves against you by"} ${num(sl.value)}%${basis}.`
      : sl.type === "points" ? `Stop loss: ${num(sl.value)} points against you${basis}.`
      : `Stop loss: ${num(sl.value)}× ATR(${sl.atrPeriod}) against you${basis}.`,
    );
  } else exit.push("Stop loss: not set.");
  if (s.exit.target) exit.push(`Target: ${num(s.exit.target.value)}${s.exit.target.type === "percent" ? "%" : " points"} in your favour${basis}.`);
  if (s.exit.trailingStop) exit.push(`Trailing stop: follows ${num(s.exit.trailingStop.value)}${s.exit.trailingStop.type === "percent" ? "%" : " points"} behind the best price.`);
  if (s.exit.squareOffAt) exit.push(`Square off everything at ${s.exit.squareOffAt} IST.`);
  if (s.exit.onOppositeSignal) exit.push("Exit when the entry condition reverses.");

  const window = [
    `New entries only between ${s.window.start} and ${s.window.end} IST.`,
    `At most ${s.maxTradesPerDay} trade${s.maxTradesPerDay === 1 ? "" : "s"} a day.`,
  ];

  const risk = [
    s.risk.dailyLossCap !== null ? `Stop trading for the day after losing ${inr(s.risk.dailyLossCap)}.` : "Daily loss cap: not set.",
    `At most ${s.risk.maxOpenPositions} open position${s.risk.maxOpenPositions === 1 ? "" : "s"}.`,
    s.risk.killSwitch ? "Kill switch on: you can stop everything instantly." : "Kill switch off.",
    s.mode === "PAPER" ? "Paper trading only. No real orders." : "Live mode requested (not available yet).",
  ];

  return {
    headline,
    sections: [
      { label: "Instrument", lines: instrument },
      { label: "Entry", lines: entry },
      { label: "Exit", lines: exit },
      { label: "Window", lines: window },
      { label: "Risk", lines: risk },
    ],
  };
}

export function summaryText(s: Strategy): string {
  const sum = summarize(s);
  return [sum.headline, ...sum.sections.map((sec) => `${sec.label}: ${sec.lines.join(" ")}`)].join("\n");
}
