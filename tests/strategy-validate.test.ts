import { describe, expect, it } from "vitest";
import { validateStrategy } from "@/lib/strategy/validate";
import { lotSizes } from "@/lib/strategy/market";
import { clone, niftyCall, relianceCash } from "./fixtures/strategies";

const codes = (r: ReturnType<typeof validateStrategy>) => r.errors.map((e) => e.code);
const warns = (r: ReturnType<typeof validateStrategy>) => r.warnings.map((e) => e.code);

describe("validator: good strategies", () => {
  it("passes a clean NIFTY option strategy with no errors or warnings", () => {
    const r = validateStrategy(niftyCall());
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.ok).toBe(true);
  });
  it("passes a clean cash strategy", () => {
    expect(validateStrategy(relianceCash()).ok).toBe(true);
  });
  it("is deterministic", () => {
    const s = clone(niftyCall());
    s.risk.dailyLossCap = null;
    expect(validateStrategy(s)).toEqual(validateStrategy(clone(s)));
  });
  it("allows MCX evening and CDS hours", () => {
    const mcx = clone(niftyCall());
    mcx.instrument = { exchange: "MCX", symbol: "CRUDEOIL", segment: "futures", expiry: { cycle: "monthly", which: "current" } };
    mcx.legs = [{ side: "SELL", option: null }];
    mcx.window = { start: "17:00", end: "23:00" };
    mcx.exit.squareOffAt = "23:15";
    expect(codes(validateStrategy(mcx))).toEqual([]);
    const cds = clone(mcx);
    cds.instrument = { exchange: "CDS", symbol: "USDINR", segment: "futures", expiry: { cycle: "monthly", which: "current" } };
    cds.window = { start: "09:00", end: "16:30" };
    cds.exit.squareOffAt = "16:45";
    expect(codes(validateStrategy(cds))).toEqual([]);
  });
  it("allows crypto around the clock with an FIU-IND warning", () => {
    const c = clone(relianceCash());
    c.instrument = { exchange: "CRYPTO", symbol: "BTCINR", segment: "cash", expiry: null };
    c.window = { start: "00:00", end: "23:59" };
    c.exit.squareOffAt = null;
    c.sizing = { mode: "qty", value: 0.01 };
    const r = validateStrategy(c);
    expect(r.ok).toBe(true);
    expect(warns(r)).toContain("crypto_fiu");
  });
});

describe("validator: errors that block approval", () => {
  it("returns schema errors instead of throwing", () => {
    const r = validateStrategy({ schemaVersion: 1 });
    expect(r.ok).toBe(false);
    expect(r.strategy).toBeNull();
    expect(r.errors.length).toBeGreaterThan(3);
  });
  it("blocks LIVE mode until Step 5", () => {
    const s = clone(niftyCall());
    s.mode = "LIVE";
    expect(codes(validateStrategy(s))).toContain("live_disabled");
  });
  it("requires a stop loss and a daily loss cap", () => {
    const s = clone(niftyCall());
    s.exit.stopLoss = null;
    s.risk.dailyLossCap = null;
    expect(codes(validateStrategy(s))).toEqual(expect.arrayContaining(["stoploss_required", "loss_cap_required"]));
  });
  it("enforces market hours per exchange and square-off before close", () => {
    const s = clone(niftyCall());
    s.window = { start: "09:00", end: "15:45" };
    s.exit.squareOffAt = "15:30";
    const c = codes(validateStrategy(s));
    expect(c).toContain("outside_hours");
    expect(c).toContain("squareoff_after_close");
    const cds = clone(niftyCall());
    cds.instrument = { exchange: "CDS", symbol: "USDINR", segment: "futures", expiry: { cycle: "monthly", which: "current" } };
    cds.legs = [{ side: "BUY", option: null }];
    cds.window = { start: "09:00", end: "17:30" };
    cds.exit.squareOffAt = "17:00";
    expect(codes(validateStrategy(cds))).toEqual(expect.arrayContaining(["outside_hours", "squareoff_after_close"]));
  });
  it("needs option details and an expiry for options", () => {
    const s = clone(niftyCall());
    s.instrument.expiry = null;
    s.legs = [{ side: "BUY", option: null }];
    expect(codes(validateStrategy(s))).toEqual(expect.arrayContaining(["expiry_missing", "option_missing"]));
  });
  it("rejects weekly expiries except NIFTY and SENSEX", () => {
    const s = clone(niftyCall());
    s.instrument.symbol = "BANKNIFTY";
    expect(codes(validateStrategy(s))).toContain("weekly_unavailable");
    const sx = clone(niftyCall());
    sx.instrument = { ...sx.instrument, exchange: "BFO", symbol: "SENSEX" };
    expect(codes(validateStrategy(sx))).not.toContain("weekly_unavailable");
  });
  it("puts index/exchange combinations right", () => {
    const s = clone(niftyCall());
    s.instrument.exchange = "NSE";
    expect(codes(validateStrategy(s))).toContain("segment_exchange");
    const b = clone(niftyCall());
    b.instrument = { ...b.instrument, exchange: "NFO", symbol: "SENSEX" };
    expect(codes(validateStrategy(b))).toContain("index_exchange");
  });
  it("requires whole lots for F&O and quantities in multiples of the lot size", () => {
    const s = clone(niftyCall());
    s.sizing = { mode: "lots", value: 1.5 };
    expect(codes(validateStrategy(s))).toContain("lots_integer");
    s.sizing = { mode: "qty", value: 100 };
    expect(codes(validateStrategy(s))).toContain("lot_multiple");
    s.sizing = { mode: "qty", value: 130 };
    expect(codes(validateStrategy(s))).not.toContain("lot_multiple");
  });
  it("uses configurable lot sizes (LOT_SIZE_OVERRIDES)", () => {
    const lots = lotSizes("NIFTY=75, FOO=10, BAD=x");
    expect(lots.NIFTY).toBe(75);
    expect(lots.FOO).toBe(10);
    expect(lots.BAD).toBeUndefined();
    const s = clone(niftyCall());
    s.sizing = { mode: "qty", value: 150 };
    expect(codes(validateStrategy(s, { lotSizes: lots }))).not.toContain("lot_multiple");
    expect(codes(validateStrategy(s))).toContain("lot_multiple");
  });
  it("blocks offshore forex and non-listed currency pairs", () => {
    const s = clone(niftyCall());
    s.instrument = { exchange: "CDS", symbol: "GBPJPY", segment: "futures", expiry: { cycle: "monthly", which: "current" } };
    s.legs = [{ side: "BUY", option: null }];
    s.window = { start: "09:00", end: "16:30" };
    expect(codes(validateStrategy(s))).toContain("currency_pair");
    const off = clone(relianceCash());
    off.instrument = { exchange: "NSE", symbol: "XAUUSD", segment: "cash", expiry: null };
    expect(codes(validateStrategy(off))).toContain("offshore_forex");
    const ok = clone(s);
    ok.instrument.symbol = "EURUSD";
    expect(codes(validateStrategy(ok))).not.toContain("currency_pair");
  });
  it("rejects time vs price comparisons, time crossovers and RSI outside 0–100", () => {
    const s = clone(niftyCall());
    s.entry.conditions.conditions = [
      { type: "compare", left: { kind: "time" }, op: ">", right: { kind: "const", value: 930 } },
      { type: "compare", left: { kind: "time" }, op: "crosses_above", right: { kind: "time_const", value: "09:30" } },
      { type: "compare", left: { kind: "rsi", period: 14 }, op: ">", right: { kind: "const", value: 120 } },
    ];
    expect(codes(validateStrategy(s))).toEqual(expect.arrayContaining(["type_mismatch", "time_cross", "rsi_range"]));
  });
  it("needs at least one entry condition and enough open positions for all legs", () => {
    const s = clone(niftyCall());
    s.entry.conditions.conditions = [];
    s.legs.push({ side: "BUY", option: { right: "PE", strike: { mode: "ATM" } } });
    expect(codes(validateStrategy(s))).toEqual(expect.arrayContaining(["entry_empty", "positions_legs"]));
  });
  it("rejects VWAP on daily candles and lots for cash", () => {
    const s = clone(niftyCall());
    s.timeframe = "1d";
    expect(codes(validateStrategy(s))).toContain("intraday_only");
    const c = clone(relianceCash());
    c.sizing = { mode: "lots", value: 1 };
    expect(codes(validateStrategy(c))).toContain("lots_cash");
  });
});

describe("validator: warnings", () => {
  it("warns about broker auto square-off, missing square-off and kill switch off", () => {
    const s = clone(niftyCall());
    s.exit.squareOffAt = "15:25";
    s.window.end = "15:00";
    s.risk.killSwitch = false;
    expect(warns(validateStrategy(s))).toEqual(expect.arrayContaining(["broker_autosquare", "kill_switch_off"]));
    s.exit.squareOffAt = null;
    expect(warns(validateStrategy(s))).toContain("no_squareoff");
  });
  it("warns on unknown lot size, overtrading and reward below risk", () => {
    const s = clone(niftyCall());
    s.instrument = { ...s.instrument, symbol: "ZOMATO", expiry: { cycle: "monthly", which: "current" } };
    s.maxTradesPerDay = 20;
    s.exit.target = { type: "percent", value: 10 };
    const w = warns(validateStrategy(s));
    expect(w).toEqual(expect.arrayContaining(["lot_unknown", "overtrading", "reward_risk"]));
    expect(validateStrategy(s).ok).toBe(true);
  });
});
