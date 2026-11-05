import { parseStrategy, groupDepth, walkComparisons, type Operand, type Strategy } from "./dsl";
import {
  ALLOWED_CURRENCY_PAIRS,
  BSE_INDICES,
  DEFAULT_LOT_SIZES,
  INDEX_UNDERLYINGS,
  WEEKLY_EXPIRY_UNDERLYINGS,
  fromMin,
  looksLikeForexPair,
  sessionFor,
  toMin,
} from "./market";

/**
 * Deterministic validator. Pure: same input → same output, no I/O, no clock.
 * errors block approval; warnings are shown but do not block.
 */
export type Issue = { path: string; code: string; message: string };
export type ValidationResult = { ok: boolean; errors: Issue[]; warnings: Issue[]; strategy: Strategy | null };
export type ValidateOptions = { lotSizes?: Record<string, number> };

const pathStr = (p: readonly PropertyKey[]) => p.map(String).join(".");

export function validateStrategy(input: unknown, opts: ValidateOptions = {}): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (path: string, code: string, message: string) => errors.push({ path, code, message });
  const warn = (path: string, code: string, message: string) => warnings.push({ path, code, message });

  const parsed = parseStrategy(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) err(pathStr(issue.path) || "strategy", "schema", friendly(issue));
    return { ok: false, errors, warnings, strategy: null };
  }
  const s = parsed.data;
  const lots = opts.lotSizes ?? DEFAULT_LOT_SIZES;
  const { exchange, segment, symbol, expiry } = s.instrument;
  const session = sessionFor(exchange);

  // ---- mode ----
  if (s.mode !== "PAPER") err("mode", "live_disabled", "Live trading is switched off until broker connect (Step 5). Use PAPER.");

  // ---- exchange / segment ----
  const cashOnly = exchange === "NSE" || exchange === "BSE";
  const derivOnly = exchange === "NFO" || exchange === "BFO" || exchange === "CDS" || exchange === "MCX";
  if (cashOnly && segment !== "cash") {
    err("instrument.segment", "segment_exchange", `${segment === "options" ? "Options" : "Futures"} on ${exchange === "NSE" ? "NSE trade on NFO" : "BSE trade on BFO"}. Change the exchange.`);
  }
  if (derivOnly && segment === "cash") err("instrument.segment", "segment_exchange", `${exchange} only lists futures and options. Pick futures or options.`);
  if (exchange === "CRYPTO" && segment === "options") err("instrument.segment", "crypto_options", "Crypto options are not supported. Use spot (cash) or futures.");
  if ((exchange === "NFO" && BSE_INDICES.has(symbol)) || (exchange === "BFO" && INDEX_UNDERLYINGS.has(symbol) && !BSE_INDICES.has(symbol))) {
    err("instrument.exchange", "index_exchange", `${symbol} derivatives trade on ${exchange === "NFO" ? "BFO" : "NFO"}, not ${exchange}.`);
  }
  if ((exchange === "NSE" || exchange === "BSE") && INDEX_UNDERLYINGS.has(symbol)) {
    err("instrument.symbol", "index_cash", `${symbol} is an index and can't be bought in cash. Use futures or options.`);
  }

  // ---- currency rules ----
  const forexish = looksLikeForexPair(symbol);
  if (exchange === "CDS" && !ALLOWED_CURRENCY_PAIRS.has(symbol)) {
    err("instrument.symbol", "currency_pair", `${symbol} isn't an exchange-traded currency pair. Allowed on CDS: ${[...ALLOWED_CURRENCY_PAIRS].join(", ")}.`);
  }
  if (forexish && exchange !== "CDS") {
    err(
      "instrument.symbol",
      "offshore_forex",
      ALLOWED_CURRENCY_PAIRS.has(symbol)
        ? `${symbol} must be traded as a currency derivative on CDS.`
        : `${symbol} looks like an offshore forex pair. Indian residents can only trade exchange-listed currency derivatives (${[...ALLOWED_CURRENCY_PAIRS].join(", ")}) on CDS.`,
    );
  }
  if (exchange === "CRYPTO") {
    warn("instrument.exchange", "crypto_fiu", "Crypto runs only via an FIU-IND registered exchange. 1% TDS and 30% tax apply; crypto is unregulated by SEBI.");
  }

  // ---- expiry / options ----
  if (segment === "cash" && expiry) err("instrument.expiry", "expiry_cash", "Cash trades have no expiry. Remove it.");
  if (segment !== "cash" && !expiry && exchange !== "CRYPTO") err("instrument.expiry", "expiry_missing", "Pick an expiry (weekly or monthly, current or next).");
  if (expiry?.cycle === "weekly") {
    if (segment === "futures") err("instrument.expiry.cycle", "weekly_futures", "Futures have monthly expiries only.");
    else if (exchange === "NFO" || exchange === "BFO") {
      if (!WEEKLY_EXPIRY_UNDERLYINGS.has(symbol)) {
        err("instrument.expiry.cycle", "weekly_unavailable", `${symbol} has no weekly expiry. Since 20 Nov 2024 only NIFTY (NSE) and SENSEX (BSE) have weeklies. Use monthly.`);
      }
    } else if (exchange === "MCX") err("instrument.expiry.cycle", "weekly_unavailable", "MCX contracts expire monthly. Use monthly.");
  }

  s.legs.forEach((leg, i) => {
    const p = `legs.${i}`;
    if (segment === "options" && !leg.option) err(`${p}.option`, "option_missing", `Leg ${i + 1}: choose CE or PE and a strike.`);
    if (segment !== "options" && leg.option) err(`${p}.option`, "option_unexpected", `Leg ${i + 1}: option details only apply to options.`);
    if (leg.option?.strike.mode === "PREMIUM_NEAR" && leg.option.strike.premium < 0.05) err(`${p}.option.strike.premium`, "premium_tick", "Premium must be at least ₹0.05.");
  });
  if (s.legs.length > 1 && segment !== "options") err("legs", "multileg_options_only", "Multi-leg positions are only for options (straddles, strangles).");
  if (s.legs.length > 1) {
    const keys = s.legs.map((l) => JSON.stringify(l));
    if (new Set(keys).size !== keys.length) err("legs", "duplicate_leg", "Two legs are identical. Remove one or change the strike.");
  }

  // ---- sizing / lots ----
  const isFno = segment === "futures" || segment === "options";
  const lotSize = lots[symbol];
  if (s.sizing.mode === "lots") {
    if (!Number.isInteger(s.sizing.value)) err("sizing.value", "lots_integer", "Lots must be a whole number.");
    if (!isFno && exchange !== "CRYPTO") err("sizing.mode", "lots_cash", "Lots apply to futures and options. Use quantity or capital % for cash.");
    if (isFno && !lotSize) warn("sizing.value", "lot_unknown", `Lot size for ${symbol} isn't in our table. Verify the contract size with the exchange before trading.`);
    if (s.sizing.value > 50) warn("sizing.value", "lots_large", "That's a large position for a new strategy. Start small on paper.");
  }
  if (s.sizing.mode === "qty") {
    if (exchange !== "CRYPTO" && !Number.isInteger(s.sizing.value)) err("sizing.value", "qty_integer", "Quantity must be a whole number.");
    if (isFno) {
      if (lotSize && s.sizing.value % lotSize !== 0) {
        err("sizing.value", "lot_multiple", `${symbol} trades in lots of ${lotSize}. Quantity must be a multiple of ${lotSize} (or switch to lots).`);
      } else if (!lotSize) {
        warn("sizing.value", "lot_unknown", `Lot size for ${symbol} isn't in our table. Make sure the quantity is a whole number of lots.`);
      }
    }
  }
  if (s.sizing.mode === "capital_pct") {
    if (s.sizing.value > 100) err("sizing.value", "capital_pct_range", "Capital % can't be more than 100.");
    else if (s.sizing.value > 25) warn("sizing.value", "capital_pct_high", "More than 25% of capital on one trade is aggressive.");
    if (isFno) warn("sizing.mode", "capital_pct_fno", "For F&O, capital % is rounded down to whole lots; if it's less than one lot no trade is taken.");
  }

  // ---- trading window / session ----
  const ws = toMin(s.window.start);
  const we = toMin(s.window.end);
  if (!session.allDay) {
    if (ws < session.open || ws >= session.close) err("window.start", "outside_hours", `${exchange} is open ${session.label}. Start must be inside market hours.`);
    if (we <= session.open || we > session.close) err("window.end", "outside_hours", `${exchange} is open ${session.label}. End must be inside market hours.`);
  }
  if (we <= ws) err("window.end", "window_order", "The window must end after it starts.");

  // ---- exits ----
  const sq = s.exit.squareOffAt ? toMin(s.exit.squareOffAt) : null;
  if (sq !== null) {
    if (!session.allDay) {
      if (sq >= session.close) err("exit.squareOffAt", "squareoff_after_close", `Square-off must be before the ${fromMin(session.close)} close.`);
      else if (sq <= session.open) err("exit.squareOffAt", "squareoff_before_open", `Square-off must be after the ${fromMin(session.open)} open.`);
      else if ((exchange === "NFO" || exchange === "BFO" || exchange === "NSE" || exchange === "BSE") && sq > toMin("15:20")) {
        warn("exit.squareOffAt", "broker_autosquare", "Most brokers auto square-off intraday positions from about 15:15–15:20. Exit earlier to stay in control.");
      }
    }
    if (sq <= ws) err("exit.squareOffAt", "squareoff_before_window", "Square-off is before the trading window starts.");
    else if (sq < we) warn("window.end", "window_after_squareoff", `New entries are allowed until ${s.window.end} but positions square off at ${s.exit.squareOffAt}. Entries after square-off are skipped.`);
  } else if (s.timeframe !== "1d" && !session.allDay) {
    warn("exit.squareOffAt", "no_squareoff", "No square-off time: intraday positions would be carried overnight. Set one (e.g. 15:10) unless you mean to hold.");
  }

  if (!s.exit.stopLoss) {
    err("exit.stopLoss", "stoploss_required", "Every entry needs a stop loss. Add one (%, points or ATR multiple).");
  } else {
    const sl = s.exit.stopLoss;
    const buyingOnly = s.legs.every((l) => l.side === "BUY");
    if (sl.type === "percent" && buyingOnly && sl.value >= 100) err("exit.stopLoss.value", "sl_range", "A stop loss of 100% or more on a buy never triggers. Use less than 100%.");
    else if (sl.type === "percent" && segment === "cash" && sl.value > 20) warn("exit.stopLoss.value", "sl_wide", "A stop loss wider than 20% on a stock is unusual. Check it.");
    if (sl.type === "atr" && sl.value > 10) warn("exit.stopLoss.value", "sl_wide", "More than 10× ATR is a very wide stop.");
  }
  if (s.exit.target && s.exit.stopLoss && s.exit.target.type === s.exit.stopLoss.type && s.exit.target.value < s.exit.stopLoss.value) {
    warn("exit.target.value", "reward_risk", "Target is smaller than the stop loss (reward below risk). That's allowed, but check it's intended.");
  }
  if (!s.exit.target && !s.exit.trailingStop && !s.exit.squareOffAt && !s.exit.onOppositeSignal) {
    warn("exit", "no_profit_exit", "There's no target, trailing stop, time exit or opposite-signal exit. Only the stop loss would close the trade.");
  }
  if (s.exit.basis === "combined" && s.legs.length < 2) warn("exit.basis", "combined_single", "Combined basis only matters with two or more legs.");

  // ---- entry conditions ----
  const g = s.entry.conditions;
  let comparisons = 0;
  if (groupDepth(g) > 3) err("entry.conditions", "too_deep", "Keep condition groups to 3 levels or fewer.");
  const intraday = s.timeframe !== "1d";
  walkComparisons(g, (c, p) => {
    comparisons++;
    const path = pathStr(p);
    const lt = isTime(c.left);
    const rt = isTime(c.right);
    if (lt !== rt) {
      err(path, "type_mismatch", "Compare a time with a time, and a price/indicator with a price/indicator.");
      return;
    }
    if (c.left.kind === "const" && c.right.kind === "const") err(path, "const_const", "Comparing two fixed numbers is always true or always false.");
    if (lt) {
      if (c.left.kind === "time_const" && c.right.kind === "time_const") err(path, "const_const", "Comparing two fixed times is always true or always false.");
      if (c.op === "crosses_above" || c.op === "crosses_below") err(path, "time_cross", "Use 'after' / 'before' (> or <) for times, not crosses.");
      for (const o of [c.left, c.right]) {
        if (o.kind === "time_const" && !session.allDay) {
          const t = toMin(o.value);
          if (t < session.open || t > session.close) err(path, "time_outside_hours", `${o.value} is outside ${exchange} hours (${session.label}).`);
        }
      }
      if (!intraday) err(path, "time_daily", "Time-of-day conditions need an intraday timeframe (not 1d).");
      return;
    }
    for (const o of [c.left, c.right]) {
      if (!intraday && (o.kind === "vwap" || o.kind === "opening_range")) err(path, "intraday_only", `${o.kind === "vwap" ? "VWAP" : "Opening range"} needs an intraday timeframe (not 1d).`);
      if (o.kind === "macd" && o.fast >= o.slow) err(path, "macd_periods", "MACD fast period must be shorter than slow.");
      if (o.kind === "opening_range" && intraday) {
        const tf = tfMinutes(s.timeframe);
        if (o.minutes % tf !== 0) warn(path, "or_timeframe", `Opening range of ${o.minutes} min isn't a multiple of the ${s.timeframe} candle.`);
        if (!session.allDay && session.open + o.minutes > ws) warn(path, "or_window", `The opening range isn't complete until ${fromMin(session.open + o.minutes)}, after your window starts.`);
      }
    }
    const rsi = c.left.kind === "rsi" ? c.right : c.right.kind === "rsi" ? c.left : null;
    if (rsi?.kind === "const" && (rsi.value < 0 || rsi.value > 100)) err(path, "rsi_range", "RSI is always between 0 and 100.");
  });
  if (comparisons === 0) err("entry.conditions", "entry_empty", "Add at least one entry condition (for example, a time like 09:20 or a price rule).");

  // ---- trades / risk ----
  if (s.maxTradesPerDay > 10) warn("maxTradesPerDay", "overtrading", "More than 10 trades a day: costs (STT, brokerage, GST) add up quickly.");
  if (s.risk.dailyLossCap === null) err("risk.dailyLossCap", "loss_cap_required", "Set a daily loss cap in ₹. Trading stops for the day when it's hit.");
  if (s.risk.maxOpenPositions < s.legs.length) {
    err("risk.maxOpenPositions", "positions_legs", `This strategy opens ${s.legs.length} legs at once; max open positions must be at least ${s.legs.length}.`);
  }
  if (!s.risk.killSwitch) warn("risk.killSwitch", "kill_switch_off", "Kill switch is off. We recommend keeping it on so you can stop everything instantly.");

  return { ok: errors.length === 0, errors, warnings, strategy: s };
}

function friendly(issue: { code: string; message: string; expected?: unknown }): string {
  if (issue.code === "invalid_type" && issue.expected === "number") return "Enter a number.";
  if (issue.code === "invalid_type" && issue.expected === "string") return "This can't be empty.";
  if (issue.code === "invalid_value" || issue.code === "invalid_union") return "Pick one of the options.";
  return issue.message;
}

function isTime(o: Operand) {
  return o.kind === "time" || o.kind === "time_const";
}

export function tfMinutes(tf: Strategy["timeframe"]): number {
  return { "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30, "1h": 60, "1d": 375 }[tf];
}
