import { describe, expect, it } from "vitest";
import { parseClock, parseOperand, parseStrategyText } from "@/lib/strategy/fallback";
import { validateStrategy } from "@/lib/strategy/validate";

function ok(text: string) {
  const r = parseStrategyText(text);
  if (!r.ok) throw new Error(`expected a draft for: ${text}\n${r.error}`);
  return r;
}
const errCodes = (s: unknown) => validateStrategy(s).errors.map((e) => e.code);

describe("rules parser: the four builder examples", () => {
  it("1. NIFTY ATM call on VWAP + RSI", () => {
    const r = ok("Buy NIFTY ATM call when 5 min close above VWAP and RSI 14 above 60 after 9:30, SL 20% target 40%, square off 3:10, stop if I lose 2000 in a day");
    const s = r.strategy;
    expect(s.instrument).toEqual({ exchange: "NFO", symbol: "NIFTY", segment: "options", expiry: { cycle: "weekly", which: "current" } });
    expect(s.legs).toEqual([{ side: "BUY", option: { right: "CE", strike: { mode: "ATM" } } }]);
    expect(s.timeframe).toBe("5m");
    expect(s.entry.conditions).toEqual({
      type: "group",
      logic: "AND",
      conditions: [
        { type: "compare", left: { kind: "price", field: "close" }, op: ">", right: { kind: "vwap" } },
        { type: "compare", left: { kind: "rsi", period: 14 }, op: ">", right: { kind: "const", value: 60 } },
      ],
    });
    expect(s.window).toEqual({ start: "09:30", end: "15:10" });
    expect(s.exit).toMatchObject({ stopLoss: { type: "percent", value: 20 }, target: { type: "percent", value: 40 }, squareOffAt: "15:10" });
    expect(s.risk.dailyLossCap).toBe(2000);
    expect(s.mode).toBe("PAPER");
    expect(r.unparsed).toEqual([]);
    expect(r.assumed.some((a) => /expiry/i.test(a))).toBe(true);
    expect(validateStrategy(s).errors).toEqual([]);
  });

  it("2. BANKNIFTY short straddle with combined-premium stop", () => {
    const r = ok("Sell BANKNIFTY straddle at 9:20, exit if combined premium rises 25%");
    const s = r.strategy;
    expect(s.legs).toEqual([
      { side: "SELL", option: { right: "CE", strike: { mode: "ATM" } } },
      { side: "SELL", option: { right: "PE", strike: { mode: "ATM" } } },
    ]);
    expect(s.instrument.expiry).toEqual({ cycle: "monthly", which: "current" });
    expect(s.entry.conditions.conditions).toEqual([{ type: "compare", left: { kind: "time" }, op: ">=", right: { kind: "time_const", value: "09:20" } }]);
    expect(s.exit.stopLoss).toEqual({ type: "percent", value: 25 });
    expect(s.exit.basis).toBe("combined");
    expect(s.risk.dailyLossCap).toBeNull(); // never invented
    expect(s.risk.maxOpenPositions).toBe(2);
    expect(errCodes(s)).toEqual(["loss_cap_required"]);
  });

  it("3. RELIANCE EMA crossover", () => {
    const s = ok("Buy RELIANCE when 15m EMA 9 crosses above EMA 21, SL 1%, target 2%").strategy;
    expect(s.instrument).toEqual({ exchange: "NSE", symbol: "RELIANCE", segment: "cash", expiry: null });
    expect(s.timeframe).toBe("15m");
    expect(s.entry.conditions.conditions).toEqual([{ type: "compare", left: { kind: "ema", period: 9 }, op: "crosses_above", right: { kind: "ema", period: 21 } }]);
    expect(s.exit.stopLoss).toEqual({ type: "percent", value: 1 });
    expect(s.exit.target).toEqual({ type: "percent", value: 2 });
    expect(s.sizing).toEqual({ mode: "qty", value: 1 });
  });

  it("4. USDINR breakout: reads 'exit at 0.3%' as a target and does not invent a stop", () => {
    const r = ok("Buy USDINR futures when it breaks yesterday's high, exit at 0.3%");
    const s = r.strategy;
    expect(s.instrument).toEqual({ exchange: "CDS", symbol: "USDINR", segment: "futures", expiry: { cycle: "monthly", which: "current" } });
    expect(s.entry.conditions.conditions).toEqual([{ type: "compare", left: { kind: "price", field: "close" }, op: "crosses_above", right: { kind: "prev_day", field: "high" } }]);
    expect(s.exit.target).toEqual({ type: "percent", value: 0.3 });
    expect(s.exit.stopLoss).toBeNull();
    expect(r.assumed.join(" ")).toMatch(/profit target/);
    expect(errCodes(s)).toEqual(expect.arrayContaining(["stoploss_required", "loss_cap_required"]));
  });
});

describe("rules parser: more patterns", () => {
  it("MCX crude short on Supertrend with points, lots, trades/day, evening square-off", () => {
    const s = ok("Short CRUDEOIL futures when 15 min close crosses below supertrend(10,3), stop loss 40 points, target 80 points, max 2 trades a day, 2 lots, daily loss limit ₹5000, square off at 11:15 pm").strategy;
    expect(s.instrument.exchange).toBe("MCX");
    expect(s.legs[0]?.side).toBe("SELL");
    expect(s.entry.conditions.conditions[0]).toEqual({ type: "compare", left: { kind: "price", field: "close" }, op: "crosses_below", right: { kind: "supertrend", period: 10, multiplier: 3 } });
    expect(s.exit).toMatchObject({ stopLoss: { type: "points", value: 40 }, target: { type: "points", value: 80 }, squareOffAt: "23:15" });
    expect(s.maxTradesPerDay).toBe(2);
    expect(s.sizing).toEqual({ mode: "lots", value: 2 });
    expect(s.risk.dailyLossCap).toBe(5000);
    expect(validateStrategy(s).ok).toBe(true);
  });

  it("SENSEX OTM put, next weekly expiry, window and trailing stop", () => {
    const s = ok("Buy SENSEX 2 strikes OTM put next week when RSI(14) crosses below 40 between 9:30 and 14:30, SL 30%, trailing SL 10%, max loss 3000 per day").strategy;
    expect(s.instrument).toEqual({ exchange: "BFO", symbol: "SENSEX", segment: "options", expiry: { cycle: "weekly", which: "next" } });
    expect(s.legs[0]?.option).toEqual({ right: "PE", strike: { mode: "OTM", steps: 2 } });
    expect(s.window).toEqual({ start: "09:30", end: "14:30" });
    expect(s.exit.trailingStop).toEqual({ type: "percent", value: 10 });
    expect(s.exit.stopLoss).toEqual({ type: "percent", value: 30 });
    expect(s.risk.dailyLossCap).toBe(3000);
  });

  it("daily HDFCBANK with SMA, MACD, ATR stop and capital %", () => {
    const r = ok("Buy HDFCBANK when price is above 200 DMA and MACD crosses above MACD signal on daily candles, SL 2 x ATR 14, target 6%, 5% of capital, stop trading after losing 10k a day");
    const s = r.strategy;
    expect(s.timeframe).toBe("1d");
    expect(s.entry.conditions.conditions).toHaveLength(2);
    expect(s.entry.conditions.conditions[0]).toMatchObject({ left: { kind: "price" }, op: ">", right: { kind: "sma", period: 200 } });
    expect(s.exit.stopLoss).toEqual({ type: "atr", value: 2, atrPeriod: 14 });
    expect(s.sizing).toEqual({ mode: "capital_pct", value: 5 });
    expect(s.risk.dailyLossCap).toBe(10000);
    expect(r.assumed.join(" ")).toMatch(/MACD/);
  });

  it("BANKNIFTY futures opening-range breakout with opposite-signal exit", () => {
    const s = ok("Buy BANKNIFTY futures when 5 min close breaks the 15 min opening range high, SL 50 pts, target 100 pts, square off 15:00, exit on opposite signal, daily loss cap 4000").strategy;
    expect(s.entry.conditions.conditions[0]).toEqual({ type: "compare", left: { kind: "price", field: "close" }, op: "crosses_above", right: { kind: "opening_range", minutes: 15, field: "high" } });
    expect(s.exit.onOppositeSignal).toBe(true);
    expect(s.instrument.expiry?.cycle).toBe("monthly");
  });

  it("NIFTY short strangle with a combined-premium stop", () => {
    const s = ok("Sell NIFTY strangle 3 strikes OTM at 9:30, exit if combined premium rises 30%, square off 3:15, 2 lots, max daily loss 6000").strategy;
    expect(s.legs.map((l) => l.option)).toEqual([
      { right: "CE", strike: { mode: "OTM", steps: 3 } },
      { right: "PE", strike: { mode: "OTM", steps: 3 } },
    ]);
    expect(s.exit.basis).toBe("combined");
    expect(validateStrategy(s).ok).toBe(true);
  });

  it("crypto with an OR group and an FIU-IND note", () => {
    const r = ok("Buy bitcoin when 1h close above EMA 50 or RSI above 70, SL 3%, target 6%, daily loss cap 5000");
    expect(r.strategy.instrument).toEqual({ exchange: "CRYPTO", symbol: "BTCINR", segment: "cash", expiry: null });
    expect(r.strategy.timeframe).toBe("1h");
    expect(r.strategy.entry.conditions.logic).toBe("OR");
    expect(r.assumed.join(" ")).toMatch(/BTCINR/);
    expect(validateStrategy(r.strategy).warnings.map((w) => w.code)).toContain("crypto_fiu");
  });

  it("maps an offshore pair faithfully so the validator blocks it", () => {
    const s = ok("Buy GBPJPY when RSI 14 below 30, SL 0.5%, target 1%, stop if I lose 1000 in a day").strategy;
    expect(s.instrument.symbol).toBe("GBPJPY");
    expect(errCodes(s)).toContain("currency_pair");
  });
});

describe("rules parser: never invents", () => {
  it("refuses when the instrument or entry is missing, and says what is missing", () => {
    const r = parseStrategyText("Buy something nice when the market feels bullish");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing.join(" ")).toMatch(/instrument/);
      expect(r.missing.join(" ")).toMatch(/entry rule/);
      expect(r.unparsed.length).toBeGreaterThan(0);
    }
  });
  it("asks futures vs options for a bare index", () => {
    const r = parseStrategyText("Buy NIFTY when RSI 14 above 60, SL 1%");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing.join(" ")).toMatch(/futures or options/);
  });
  it("lists text it could not read", () => {
    const r = ok("Buy NIFTY ATM call when 5 min close above VWAP and the moon is full, SL 20%, stop if I lose 2000 in a day");
    expect(r.unparsed).toEqual(["and the moon is full"]);
  });
  it("does not guess a unit for a bare stop loss number", () => {
    const r = ok("Buy RELIANCE when 15m EMA 9 crosses above EMA 21, SL 20, daily loss cap 1000");
    expect(r.strategy.exit.stopLoss).toBeNull();
    expect(r.unparsed.join(" ")).toMatch(/say % or points/);
  });
  it("points non-English scripts to the Gemini engine", () => {
    const r = parseStrategyText("निफ्टी कॉल खरीदो जब RSI 60 से ऊपर हो");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Gemini/);
  });
});

describe("helpers", () => {
  it("parses market clock times", () => {
    expect(parseClock("3:10")).toBe("15:10");
    expect(parseClock("9.30")).toBe("09:30");
    expect(parseClock("11:15 pm")).toBe("23:15");
    expect(parseClock("12")).toBe("12:00");
    expect(parseClock("25:00")).toBeNull();
  });
  it("parses operands", () => {
    expect(parseOperand("20 ema")?.operand).toEqual({ kind: "ema", period: 20 });
    expect(parseOperand("lower bollinger band")?.operand).toEqual({ kind: "bollinger", period: 20, stddev: 2, band: "lower" });
    expect(parseOperand("pdl")?.operand).toEqual({ kind: "prev_day", field: "low" });
    expect(parseOperand("3 min close")).toMatchObject({ operand: { kind: "price", field: "close" }, timeframe: "3m" });
    expect(parseOperand("banana")).toBeNull();
  });
});
