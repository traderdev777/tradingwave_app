import type { Strategy } from "@/lib/strategy/dsl";

/** A complete, valid strategy used as the base for tests. */
export function niftyCall(): Strategy {
  return {
    schemaVersion: 1,
    instrument: { exchange: "NFO", symbol: "NIFTY", segment: "options", expiry: { cycle: "weekly", which: "current" } },
    timeframe: "5m",
    legs: [{ side: "BUY", option: { right: "CE", strike: { mode: "ATM" } } }],
    entry: {
      conditions: {
        type: "group",
        logic: "AND",
        conditions: [
          { type: "compare", left: { kind: "price", field: "close" }, op: ">", right: { kind: "vwap" } },
          { type: "compare", left: { kind: "rsi", period: 14 }, op: ">", right: { kind: "const", value: 60 } },
        ],
      },
    },
    exit: { stopLoss: { type: "percent", value: 20 }, target: { type: "percent", value: 40 }, trailingStop: null, squareOffAt: "15:10", onOppositeSignal: false, basis: "per_leg" },
    window: { start: "09:30", end: "15:10" },
    maxTradesPerDay: 1,
    sizing: { mode: "lots", value: 1 },
    risk: { dailyLossCap: 2000, maxOpenPositions: 1, killSwitch: true },
    mode: "PAPER",
  };
}

export function relianceCash(): Strategy {
  return {
    ...niftyCall(),
    instrument: { exchange: "NSE", symbol: "RELIANCE", segment: "cash", expiry: null },
    timeframe: "15m",
    legs: [{ side: "BUY", option: null }],
    entry: { conditions: { type: "group", logic: "AND", conditions: [{ type: "compare", left: { kind: "ema", period: 9 }, op: "crosses_above", right: { kind: "ema", period: 21 } }] } },
    exit: { stopLoss: { type: "percent", value: 1 }, target: { type: "percent", value: 2 }, trailingStop: null, squareOffAt: "15:10", onOppositeSignal: false, basis: "per_leg" },
    window: { start: "09:15", end: "15:00" },
    sizing: { mode: "qty", value: 10 },
  };
}

export function clone<T>(x: T): T {
  return structuredClone(x);
}
