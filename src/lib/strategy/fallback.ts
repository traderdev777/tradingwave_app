import {
  SCHEMA_VERSION,
  type Comparison,
  type CompareOp,
  type Condition,
  type ConditionGroup,
  type Exchange,
  type Leg,
  type Operand,
  type Segment,
  type Strategy,
  type Timeframe,
} from "./dsl";
import { ALLOWED_CURRENCY_PAIRS, BSE_INDICES, INDEX_UNDERLYINGS, WEEKLY_EXPIRY_UNDERLYINGS, fromMin, looksLikeForexPair, sessionFor, toMin } from "./market";

/**
 * Deterministic rules parser: English (plus a little Hinglish) → Strategy DSL.
 * No network, no randomness. It only maps phrases it recognises. Anything it fills in
 * by convention is listed in `assumed`; anything it can't read is listed in `unparsed`.
 * Safety-critical values (stop loss, daily loss cap) are never filled in.
 */
export type ParseOutcome =
  | { ok: true; strategy: Strategy; assumed: string[]; unparsed: string[]; suggestedName: string }
  | { ok: false; missing: string[]; unparsed: string[]; error: string };

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const NUMW = "(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|an?)";
const toNum = (s: string) => (s in NUM_WORDS ? NUM_WORDS[s]! : Number(s));
const UNIT = "(%|percent|pct|pts?\\b|points?\\b|rs\\.?|₹)?";
const TIME_STRICT = "\\d{1,2}[:.]\\d{2}(?!\\s*%)(?:\\s*(?:am|pm))?|\\d{1,2}\\s*(?:am|pm)\\b";
const TIME_LOOSE = "\\d{1,2}(?:[:.]\\d{2})?(?:\\s*(?:am|pm)\\b)?(?!\\s*(?:%|min|minute|m\\b|lots?|qty|x\\b|times|\\.\\d|\\d))";

/** "3:10" → 15:10 (market context), "9.30" → 09:30, "2 pm" → 14:00. */
export function parseClock(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3];
  if (min > 59 || h > 23) return null;
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h >= 1 && h <= 7) h += 12; // "3:10" in an Indian trading context means 15:10
  return fromMin(h * 60 + min);
}

// ---------- span bookkeeping ----------

class Text {
  readonly s: string;
  readonly orig: string;
  private used: boolean[];
  constructor(orig: string) {
    this.orig = orig;
    const lower = orig.toLowerCase();
    this.s = (lower.length === orig.length ? lower : orig).replace(/[’`]/g, "'").replace(/[–—]/g, "-");
    this.used = new Array(this.s.length).fill(false);
  }
  free(a: number, b: number) {
    for (let i = a; i < b; i++) if (this.used[i]) return false;
    return true;
  }
  mark(a: number, b: number) {
    for (let i = a; i < b; i++) this.used[i] = true;
  }
  /** All non-overlapping matches over unused text; marks them used. */
  take(re: RegExp, max = Infinity): RegExpMatchArray[] {
    const out: RegExpMatchArray[] = [];
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    for (const m of this.s.matchAll(g)) {
      if (out.length >= max) break;
      const a = m.index ?? 0;
      const b = a + m[0].length;
      if (m[0].length === 0 || !this.free(a, b)) continue;
      this.mark(a, b);
      out.push(m);
    }
    return out;
  }
  takeOne(re: RegExp) {
    return this.take(re, 1)[0];
  }
  leftovers(): string[] {
    const pieces: string[] = [];
    let cur = "";
    for (let i = 0; i < this.s.length; i++) {
      if (this.used[i]) {
        if (cur.trim()) pieces.push(cur);
        cur = "";
      } else cur += this.orig[i];
    }
    if (cur.trim()) pieces.push(cur);
    return pieces;
  }
}

const STOP = new Set(
  ("when if and or the a an at of with then i my me it its is are be in on for to by from candle candles chart bar bars please strategy " +
    "enter entry go take trade trades position positions also only should will want would like exit exits close all intraday mis nrml " +
    "this that above below rises falls day days time once as soon whenever jab ka ki ke ko hai se aur karo kar do lo price " +
    "contract contracts index stock share shares market order orders new same every each per its' let's lets basis option options").split(" "),
);

function cleanFragment(f: string): string | null {
  const words = f.replace(/[,;.!?()"]+/g, " ").split(/\s+/).filter(Boolean);
  const meaningful = words.filter((w) => !STOP.has(w.toLowerCase().replace(/'s$/, "")));
  if (meaningful.length === 0) return null;
  return f.replace(/^[\s,;.]+|[\s,;.]+$/g, "");
}

// ---------- symbols ----------

const INDEX_ALIASES: [RegExp, string][] = [
  [/\b(?:bank\s*nifty|nifty\s*bank|bnf)\b/, "BANKNIFTY"],
  [/\b(?:fin\s*nifty|nifty\s*fin(?:ancial)?(?:\s*services)?)\b/, "FINNIFTY"],
  [/\b(?:midcap\s*nifty|midcpnifty|nifty\s*mid\s*select|midcap\s*select)\b/, "MIDCPNIFTY"],
  [/\b(?:nifty\s*next\s*50|niftynxt50|nifty\s*junior)\b/, "NIFTYNXT50"],
  [/\bsensex\s*50\b/, "SENSEX50"],
  [/\bsensex\b/, "SENSEX"],
  [/\bbankex\b/, "BANKEX"],
  [/\bnifty(?:\s*50)?\b/, "NIFTY"],
];
const COMMODITY_ALIASES: [RegExp, string][] = [
  [/\bcrude\s*oil\s*mini\b|\bcrudeoilm\b/, "CRUDEOILM"],
  [/\bcrude(?:\s*oil)?\b|\bcrudeoil\b/, "CRUDEOIL"],
  [/\bnatural\s*gas\b|\bnaturalgas\b|\bnat\s*gas\b/, "NATURALGAS"],
  [/\bgold\s*mini\b|\bgoldm\b/, "GOLDM"],
  [/\bgold\b/, "GOLD"],
  [/\bsilver\s*mini\b|\bsilverm\b/, "SILVERM"],
  [/\bsilver\b/, "SILVER"],
  [/\bcopper\b/, "COPPER"],
  [/\bzinc\b/, "ZINC"],
  [/\baluminium\b|\baluminum\b/, "ALUMINIUM"],
];
const CRYPTO_ALIASES: [RegExp, string, boolean][] = [
  [/\bbtc\s*\/?\s*usdt\b/, "BTCUSDT", false],
  [/\beth\s*\/?\s*usdt\b/, "ETHUSDT", false],
  [/\bbtc\s*\/?\s*inr\b/, "BTCINR", false],
  [/\beth\s*\/?\s*inr\b/, "ETHINR", false],
  [/\bbitcoin\b|\bbtc\b/, "BTCINR", true],
  [/\bethereum\b|\beth\b|\bether\b/, "ETHINR", true],
];
const STOCK_ALIASES: [RegExp, string][] = [
  [/\breliance(?:\s*industries)?\b/, "RELIANCE"],
  [/\btcs\b|\btata\s*consultancy\b/, "TCS"],
  [/\binfosys\b|\binfy\b/, "INFY"],
  [/\bhdfc\s*bank\b|\bhdfcbank\b/, "HDFCBANK"],
  [/\bicici\s*bank\b|\bicicibank\b/, "ICICIBANK"],
  [/\bsbi\b|\bsbin\b|\bstate\s*bank\b/, "SBIN"],
  [/\baxis\s*bank\b|\baxisbank\b/, "AXISBANK"],
  [/\bkotak(?:\s*mahindra)?\s*bank\b|\bkotakbank\b/, "KOTAKBANK"],
  [/\bairtel\b|\bbharti\s*airtel\b|\bbhartiartl\b/, "BHARTIARTL"],
  [/\btata\s*motors\b|\btatamotors\b/, "TATAMOTORS"],
  [/\btata\s*steel\b|\btatasteel\b/, "TATASTEEL"],
  [/\bitc\b/, "ITC"],
  [/\bwipro\b/, "WIPRO"],
  [/\bmaruti\b/, "MARUTI"],
  [/\blarsen\b|\bl&t\b/, "LT"],
  [/\bbajaj\s*finance\b|\bbajfinance\b/, "BAJFINANCE"],
  [/\bhindustan\s*unilever\b|\bhul\b|\bhindunilvr\b/, "HINDUNILVR"],
];
const CCY_ALIASES: [RegExp, string][] = [
  [/\b(?:usd\s*[\/-]?\s*inr|dollar[\s-]*rupee)\b/, "USDINR"],
  [/\beur\s*[\/-]?\s*inr\b/, "EURINR"],
  [/\bgbp\s*[\/-]?\s*inr\b/, "GBPINR"],
  [/\bjpy\s*[\/-]?\s*inr\b/, "JPYINR"],
];
const ISO = "usd|eur|gbp|jpy|aud|nzd|cad|chf|cnh|cny|hkd|sgd|zar|xau|xag|inr|aed";
const KEYWORDS = new Set(
  "SL TP TGT ATM ITM OTM CE PE RSI EMA SMA DMA MA VWAP MACD ATR IST AND OR NSE BSE NFO BFO MCX CDS PM AM ORB PDH PDL PDC MIS NRML CNC BUY SELL LTP OHLC FNO F&O FO OI IV I".split(" "),
);

type SymbolHit = { symbol: string; kind: "index" | "stock" | "currency" | "commodity" | "crypto"; note?: string };

function findSymbol(t: Text): SymbolHit | null {
  for (const [re, sym] of CCY_ALIASES) if (t.takeOne(re)) return { symbol: sym, kind: "currency" };
  for (const [re, sym] of INDEX_ALIASES) if (t.takeOne(re)) return { symbol: sym, kind: "index" };
  for (const [re, sym, assumed] of CRYPTO_ALIASES)
    if (t.takeOne(re)) return { symbol: sym, kind: "crypto", note: assumed ? `Read the coin as the ${sym} (INR) pair. Change it if you trade a USDT pair.` : undefined };
  const pair = t.takeOne(new RegExp(`\\b(${ISO})\\s*[\\/-]?\\s*(${ISO})\\b`));
  if (pair && pair[1] !== pair[2]) return { symbol: `${pair[1]}${pair[2]}`.toUpperCase(), kind: "currency" };
  for (const [re, sym] of COMMODITY_ALIASES) if (t.takeOne(re)) return { symbol: sym, kind: "commodity" };
  for (const [re, sym] of STOCK_ALIASES) if (t.takeOne(re)) return { symbol: sym, kind: "stock" };
  // An all-caps ticker in the original text (e.g. "HDFCLIFE").
  for (const m of t.orig.matchAll(/\b[A-Z][A-Z0-9&-]{1,19}\b/g)) {
    const a = m.index ?? 0;
    if (KEYWORDS.has(m[0]) || !t.free(a, a + m[0].length)) continue;
    if (/^\d/.test(m[0])) continue;
    t.mark(a, a + m[0].length);
    if (looksLikeForexPair(m[0])) return { symbol: m[0], kind: "currency" };
    return { symbol: m[0], kind: "stock" };
  }
  return null;
}

// ---------- operands ----------

const OPERAND_SRC = [
  "(?:(?:\\d+\\s*(?:m|min|mins|minute|minutes)\\s+)?(?:candle\\s+)?(?:close|closing\\s+price|open|high|low|ltp|price|spot)\\b)",
  "vwap",
  "(?:ema|sma|dma|ma|moving\\s+average)\\s*\\(?\\s*\\d+\\s*\\)?",
  "\\d+\\s*(?:-\\s*)?(?:period\\s+|day\\s+)?(?:ema|sma|dma|ma)\\b",
  "rsi\\s*\\(?\\s*\\d*\\s*\\)?",
  "macd(?:\\s*(?:line|signal(?:\\s*line)?|histogram|hist))?",
  "supertrend(?:\\s*\\(?\\s*\\d+\\s*[, ]\\s*\\d+(?:\\.\\d+)?\\s*\\)?)?",
  "(?:upper|lower|middle|mid)\\s+bollinger(?:\\s+bands?)?",
  "bollinger(?:\\s+bands?)?\\s+(?:upper|lower|middle|mid)(?:\\s+band)?",
  "atr\\s*\\(?\\s*\\d*\\s*\\)?",
  "(?:yesterday'?s?|previous\\s+day'?s?|prev(?:ious)?\\.?\\s+day'?s?|pd)\\s*(?:high|low|close)",
  "pdh|pdl|pdc",
  "(?:\\d+\\s*(?:-\\s*)?(?:min|minute)s?\\s+)?opening\\s+range\\s+(?:high|low)",
  "orb?\\s+(?:high|low)",
  "first\\s+\\d+\\s*(?:min|minute)s?\\s+(?:high|low)",
  "-?\\d+(?:\\.\\d+)?",
].join("|");

const CMP_SRC = [
  "cross(?:es|ed)?\\s+(?:above|over)", "cross(?:es|ed)?\\s+(?:below|under)", "crossover\\s+(?:above\\s+)?", "crossunder\\s+(?:below\\s+)?",
  "cuts?\\s+(?:above|below)", "breaks?\\s+(?:out\\s+)?above", "breaks?\\s+(?:down\\s+)?below", "breaks?(?:\\s+out)?",
  "(?:is|goes|moves|trades|closes|close|stays|remains)\\s+(?:above|below|over|under|greater\\s+than|less\\s+than)",
  "is\\s+at\\s+or\\s+(?:above|below)", "at\\s+or\\s+(?:above|below)",
  "above", "below", "over", "under", "greater\\s+than", "less\\s+than", "more\\s+than", ">=", "<=", ">", "<",
  "(?:ke|se)\\s+upar", "(?:ke|se)\\s+neeche", "upar", "neeche",
].join("|");

const COND_RE = new RegExp(`(?:(?:the\\s+)?(${OPERAND_SRC})\\s*)?(${CMP_SRC})\\s*(?:the\\s+)?(${OPERAND_SRC})`, "g");

type OperandParse = { operand: Operand; timeframe?: Timeframe; notes: string[] };

function tfFromMinutes(n: number): Timeframe | null {
  return ({ 1: "1m", 3: "3m", 5: "5m", 15: "15m", 30: "30m", 60: "1h" } as Record<number, Timeframe>)[n] ?? null;
}

export function parseOperand(raw: string): OperandParse | null {
  const s = raw.trim().replace(/\s+/g, " ");
  const notes: string[] = [];
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(?:(\d+)\s*(?:m|min|mins|minute|minutes)\s+)?(?:candle\s+)?(close|closing price|open|high|low|ltp|price|spot)$/))) {
    const tf = m[1] ? tfFromMinutes(Number(m[1])) : undefined;
    const f = m[2]!;
    const field = f === "price" || f === "spot" || f === "closing price" ? "close" : (f as "open" | "high" | "low" | "close" | "ltp");
    return { operand: { kind: "price", field }, timeframe: tf ?? undefined, notes };
  }
  if (s === "vwap") return { operand: { kind: "vwap" }, notes };
  if ((m = s.match(/^(ema|sma|dma|ma|moving average)\s*\(?\s*(\d+)\s*\)?$/)) || (m = s.match(/^(\d+)\s*-?\s*(?:period |day )?(ema|sma|dma|ma)$/))) {
    const [kindRaw, p] = /\d/.test(m[1]!) ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    return { operand: { kind: kindRaw === "ema" ? "ema" : "sma", period: Number(p) }, notes };
  }
  if ((m = s.match(/^rsi\s*\(?\s*(\d*)\s*\)?$/))) {
    if (!m[1]) notes.push("RSI period not stated: used the standard 14.");
    return { operand: { kind: "rsi", period: m[1] ? Number(m[1]) : 14 }, notes };
  }
  if ((m = s.match(/^macd(?:\s*(line|signal(?: line)?|histogram|hist))?$/))) {
    notes.push("MACD uses the standard 12, 26, 9 settings.");
    const l = m[1] ?? "line";
    return { operand: { kind: "macd", fast: 12, slow: 26, signal: 9, line: l.startsWith("signal") ? "signal" : l.startsWith("hist") ? "hist" : "macd" }, notes };
  }
  if ((m = s.match(/^supertrend(?:\s*\(?\s*(\d+)\s*[, ]\s*(\d+(?:\.\d+)?)\s*\)?)?$/))) {
    if (!m[1]) notes.push("Supertrend settings not stated: used the standard 10, 3.");
    return { operand: { kind: "supertrend", period: m[1] ? Number(m[1]) : 10, multiplier: m[2] ? Number(m[2]) : 3 }, notes };
  }
  if ((m = s.match(/^(upper|lower|middle|mid) bollinger(?: bands?)?$/)) || (m = s.match(/^bollinger(?: bands?)? (upper|lower|middle|mid)(?: band)?$/))) {
    notes.push("Bollinger Bands use the standard 20, 2 settings.");
    const b = m[1]!;
    return { operand: { kind: "bollinger", period: 20, stddev: 2, band: b === "mid" ? "middle" : (b as "upper" | "lower" | "middle") }, notes };
  }
  if ((m = s.match(/^atr\s*\(?\s*(\d*)\s*\)?$/))) {
    if (!m[1]) notes.push("ATR period not stated: used the standard 14.");
    return { operand: { kind: "atr", period: m[1] ? Number(m[1]) : 14 }, notes };
  }
  if ((m = s.match(/^(?:yesterday'?s?|previous day'?s?|prev(?:ious)?\.? day'?s?|pd)\s*(high|low|close)$/))) {
    return { operand: { kind: "prev_day", field: m[1] as "high" | "low" | "close" }, notes };
  }
  if ((m = s.match(/^pd([hlc])$/))) return { operand: { kind: "prev_day", field: m[1] === "h" ? "high" : m[1] === "l" ? "low" : "close" }, notes };
  if ((m = s.match(/^(?:(\d+)\s*-?\s*(?:min|minute)s?\s+)?opening range (high|low)$/)) || (m = s.match(/^orb? (high|low)$/)) || (m = s.match(/^first (\d+)\s*(?:min|minute)s? (high|low)$/))) {
    const hasMin = m.length === 3 && m[1] && /^\d+$/.test(m[1]);
    const minutes = hasMin ? Number(m[1]) : 15;
    if (!hasMin) notes.push("Opening range length not stated: used the first 15 minutes.");
    const field = (m.length === 3 ? m[2] : m[1]) as "high" | "low";
    return { operand: { kind: "opening_range", minutes, field }, notes };
  }
  if ((m = s.match(/^-?\d+(?:\.\d+)?$/))) return { operand: { kind: "const", value: Number(s) }, notes };
  return null;
}

function parseCmp(raw: string, right: Operand): CompareOp {
  const s = raw.replace(/\s+/g, " ").trim();
  if (/^cross(es|ed)? (above|over)|^crossover|^cuts? above|^breaks? (out )?above/.test(s)) return "crosses_above";
  if (/^cross(es|ed)? (below|under)|^crossunder|^cuts? below|^breaks? (down )?below/.test(s)) return "crosses_below";
  if (/^breaks?/.test(s)) {
    const down = (right.kind === "prev_day" && right.field === "low") || (right.kind === "opening_range" && right.field === "low") || (right.kind === "bollinger" && right.band === "lower");
    return down ? "crosses_below" : "crosses_above";
  }
  if (/at or above|>=/.test(s)) return ">=";
  if (/at or below|<=/.test(s)) return "<=";
  if (/above|over|greater|more|>|upar/.test(s)) return ">";
  return "<";
}

// ---------- main ----------

export function parseStrategyText(input: string): ParseOutcome {
  const text = input.trim();
  if (!text) return { ok: false, missing: ["a description"], unparsed: [], error: "Describe your strategy first." };
  if (/[\u0900-\u097F\u0C80-\u0CFF\u0B80-\u0BFF\u0C00-\u0C7F]/.test(text)) {
    return {
      ok: false,
      missing: [],
      unparsed: [],
      error: "The built-in rules engine reads English only. Hindi, Kannada, Tamil and Telugu need the Gemini engine (add GEMINI_API_KEY), or rewrite this in English.",
    };
  }
  const t = new Text(text);
  const assumed: string[] = [];
  const unparsed: string[] = [];

  // --- risk: daily loss cap (before anything that could eat "lose 2000") ---
  let dailyLossCap: number | null = null;
  const amt = "(?:₹|rs\\.?|inr)?\\s*([\\d,]+(?:\\.\\d+)?)\\s*(k|thousand|lakh|l\\b)?\\s*(?:rupees|rs\\.?|inr)?";
  const loss =
    t.takeOne(new RegExp(`(?:stop|halt|quit|pause|no more trades?|stop trading)(?:\\s+trading)?(?:\\s+for\\s+the\\s+day)?\\s+(?:if|when|after|once)\\s+(?:i|we)?\\s*(?:lose|loss|lost|losing|am down|are down|down)(?:\\s+(?:of|by|more than|over))?\\s*${amt}(?:\\s*(?:in\\s+a|a|per|in\\s+the|for\\s+the)\\s+day|\\s*daily|\\s*today)?`)) ??
    t.takeOne(new RegExp(`(?:max(?:imum)?\\s+)?(?:daily\\s+loss|loss\\s+per\\s+day|day'?s?\\s+loss)(?:\\s+(?:cap|limit|of|is|=|:))*\\s*${amt}`)) ??
    t.takeOne(new RegExp(`(?:max(?:imum)?\\s+)?loss\\s+(?:cap|limit)\\s*(?:of|is|=|:)?\\s*${amt}(?:\\s*(?:per|a|in\\s+a)\\s+day|\\s*daily)?`)) ??
    t.takeOne(new RegExp(`max(?:imum)?\\s+loss\\s*(?:of|is|=|:)?\\s*${amt}\\s*(?:per|a|in\\s+a)\\s+day`));
  if (loss) {
    let v = Number(loss[1]!.replace(/,/g, ""));
    const mult = loss[2];
    if (mult === "k" || mult === "thousand") v *= 1000;
    if (mult === "lakh" || mult === "l") v *= 100000;
    if (v > 0) dailyLossCap = v;
  }

  // --- trades / positions / sizing ---
  let maxTrades: number | null = null;
  const mt =
    t.takeOne(new RegExp(`(?:max(?:imum)?|at\\s+most|only|upto|up\\s+to|no\\s+more\\s+than)\\s+${NUMW}\\s+trades?(?:\\s+(?:per|a|in\\s+a)\\s+day|\\s+daily)?`)) ??
    t.takeOne(new RegExp(`${NUMW}\\s+trades?\\s+(?:per|a|in\\s+a)\\s+day`));
  if (mt) maxTrades = toNum(mt[1]!);
  let maxOpen: number | null = null;
  const mo = t.takeOne(new RegExp(`(?:max(?:imum)?|at\\s+most|only|upto|up\\s+to)\\s+${NUMW}\\s+(?:open\\s+)?positions?`));
  if (mo) maxOpen = toNum(mo[1]!);
  let sizing: Strategy["sizing"] | null = null;
  const lotsM = t.takeOne(new RegExp(`${NUMW}\\s+lots?\\b`));
  const qtyM = !lotsM ? t.takeOne(/(?:qty|quantity)\s*(?:of|=|:)?\s*(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*(?:shares|qty|quantity|units|nos)\b/) : undefined;
  const capM = !lotsM && !qtyM ? t.takeOne(/(\d+(?:\.\d+)?)\s*%\s*(?:of\s+)?(?:my\s+)?(?:capital|funds|portfolio|account|margin)/) : undefined;
  if (lotsM) sizing = { mode: "lots", value: toNum(lotsM[1]!) };
  else if (qtyM) sizing = { mode: "qty", value: Number(qtyM[1] ?? qtyM[2]) };
  else if (capM) sizing = { mode: "capital_pct", value: Number(capM[1]) };

  // --- exits ---
  let stopLoss: Strategy["exit"]["stopLoss"] = null;
  let target: Strategy["exit"]["target"] = null;
  let trailing: Strategy["exit"]["trailingStop"] = null;
  let basis: Strategy["exit"]["basis"] = "per_leg";
  let squareOffAt: string | null = null;
  let onOpposite = false;
  const unitOf = (u: string | undefined): "percent" | "points" | null =>
    !u ? null : /%|percent|pct/.test(u) ? "percent" : /pt|point/.test(u) ? "points" : null;

  const prem = t.takeOne(/(?:exit|stop|sl|close|square\s*off)\s+(?:the\s+)?(?:trade\s+|position\s+)?(?:if|when|once)\s+(?:the\s+)?(combined|total|net)?\s*premium\s+(?:rises|increases|goes\s+up|moves\s+up|is\s+up|jumps)\s*(?:by\s+)?(\d+(?:\.\d+)?)\s*(%|percent|pts?|points?)/);
  if (prem) {
    const u = unitOf(prem[3]) ?? "percent";
    stopLoss = { type: u, value: Number(prem[2]) };
    if (prem[1]) basis = "combined";
  }
  const premDouble = !stopLoss ? t.takeOne(/(?:exit|stop|sl|close)\s+(?:if|when|once)\s+(?:the\s+)?(combined|total|net)?\s*premium\s+doubles/) : undefined;
  if (premDouble) {
    stopLoss = { type: "percent", value: 100 };
    if (premDouble[1]) basis = "combined";
  }
  const premFall = t.takeOne(/(?:exit|book\s+profits?|close)\s+(?:if|when|once)\s+(?:the\s+)?(combined|total|net)?\s*premium\s+(?:falls|drops|decays|decreases|goes\s+down)\s*(?:by\s+)?(\d+(?:\.\d+)?)\s*(%|percent|pts?|points?)/);
  if (premFall) {
    target = { type: unitOf(premFall[3]) ?? "percent", value: Number(premFall[2]) };
    if (premFall[1]) basis = "combined";
  }

  const trail =
    t.takeOne(new RegExp(`trail(?:ing)?\\s*(?:sl|stop[\\s-]?loss|stop)?\\s*(?:of|by|at|=|:)?\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}`)) ??
    t.takeOne(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT}\\s*trailing(?:\\s*(?:sl|stop[\\s-]?loss|stop))?`));
  if (trail) {
    const u = unitOf(trail[2]);
    if (u) trailing = { type: u, value: Number(trail[1]) };
    else unparsed.push(`${trail[0].trim()} (say % or points)`);
  }

  const atrSl = !stopLoss ? t.takeOne(/(?:sl|stop[\s-]?loss|stoploss|stop)\s*(?:of|at|=|:)?\s*(\d+(?:\.\d+)?)\s*(?:x|times|×)?\s*atr\s*\(?\s*(\d*)\s*\)?/) : undefined;
  if (atrSl) {
    stopLoss = { type: "atr", value: Number(atrSl[1]), atrPeriod: atrSl[2] ? Number(atrSl[2]) : 14 };
    if (!atrSl[2]) assumed.push("ATR period for the stop loss not stated: used 14.");
  }
  if (!stopLoss) {
    const sl =
      t.takeOne(new RegExp(`(?:sl|stop[\\s-]?loss|stoploss|stop)\\s*(?:of|at|=|:|-)?\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}`)) ??
      t.takeOne(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(%|percent|pct|pts?\\b|points?\\b)\\s*(?:sl|stop[\\s-]?loss|stoploss|stop)\\b`));
    if (sl) {
      const u = unitOf(sl[2]);
      if (u) stopLoss = { type: u, value: Number(sl[1]) };
      else unparsed.push(`${sl[0].trim()} (stop loss: say % or points)`);
    }
  }
  if (!target) {
    const tg =
      t.takeOne(new RegExp(`(?:target|tgt|tp|take[\\s-]?profit|profit\\s+target|book\\s+profits?)\\s*(?:of|at|=|:|-)?\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT}`)) ??
      t.takeOne(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(%|percent|pct|pts?\\b|points?\\b)\\s*(?:target|tgt|profit)\\b`));
    if (tg) {
      const u = unitOf(tg[2]);
      if (u) target = { type: u, value: Number(tg[1]) };
      else unparsed.push(`${tg[0].trim()} (target: say % or points)`);
    }
  }
  if (!target) {
    const ex = t.takeOne(/(?:exit|get\s+out|close)\s+(?:at|after|on)\s+(?:a\s+)?(\d+(?:\.\d+)?)\s*(%|percent|pct|pts?\b|points?\b)(?:\s+(?:profit|gain|move|up))?/);
    if (ex) {
      target = { type: unitOf(ex[2]) ?? "percent", value: Number(ex[1]) };
      assumed.push(`Read "${ex[0].trim()}" as a ${ex[1]}${unitOf(ex[2]) === "points" ? " point" : "%"} profit target. It is not a stop loss.`);
    }
  }

  const sq = t.takeOne(new RegExp(`(?:square[\\s-]?off|squareoff|sq\\.?\\s*off|exit\\s+(?:all\\s+)?(?:positions?\\s+)?(?:at|by)|close\\s+(?:all\\s+)?(?:positions?\\s+)?(?:at|by)|time\\s+exit(?:\\s+at)?)\\s*(?:at|by|@)?\\s*(${TIME_STRICT}|\\d{1,2}(?![\\d.%:]))`));
  if (sq) squareOffAt = parseClock(sq[1]!);

  if (t.takeOne(/exit\s+(?:on|at|with)\s+(?:the\s+)?(?:opposite|reverse)\s+(?:signal|crossover|cross|condition)|(?:opposite|reverse)\s+(?:signal|crossover)\s+exit|exit\s+(?:when|if)\s+(?:it|the\s+signal|the\s+condition)\s+reverses/)) onOpposite = true;

  // Custom exit conditions ("exit when EMA 9 crosses below EMA 21"): only the mirror of an entry is supported.
  const exitConds: { cmp: Comparison; text: string }[] = [];
  for (const m of t.s.matchAll(/(?:exit|close|get\s+out)\s+(?:when|if|once)\s+/g)) {
    const from = (m.index ?? 0) + m[0].length;
    const rest = t.s.slice(from);
    const cm = rest.match(new RegExp(`^(?:(${OPERAND_SRC})\\s*)?(${CMP_SRC})\\s*(${OPERAND_SRC})`));
    if (!cm || !t.free(m.index ?? 0, from + cm[0].length)) continue;
    const c = buildComparison(cm[1], cm[2]!, cm[3]!, [], assumed);
    if (c) {
      exitConds.push({ cmp: c.cmp, text: t.orig.slice(m.index ?? 0, from + cm[0].length) });
      t.mark(m.index ?? 0, from + cm[0].length);
    }
  }

  // --- times: window and entry time ---
  let windowStart: string | null = null;
  let windowEnd: string | null = null;
  let entryAt: string | null = null;
  const between = t.takeOne(new RegExp(`(?:between|from)\\s+(${TIME_LOOSE})\\s*(?:and|to|-|till|until)\\s*(${TIME_LOOSE})`));
  if (between) {
    windowStart = parseClock(between[1]!);
    windowEnd = parseClock(between[2]!);
  }
  const after = t.takeOne(new RegExp(`(?:after|post|from|not\\s+before)\\s+(${TIME_LOOSE})`));
  if (after) windowStart = parseClock(after[1]!);
  const before = t.takeOne(new RegExp(`(?:before|till|until|upto|up\\s+to|no\\s+entries\\s+after|no\\s+new\\s+trades\\s+after)\\s+(${TIME_LOOSE})`));
  if (before) windowEnd = parseClock(before[1]!);
  const at = t.takeOne(new RegExp(`(?:at|@)\\s+(${TIME_STRICT})`));
  if (at) entryAt = parseClock(at[1]!);

  // --- timeframe ---
  let timeframe: Timeframe | null = null;
  const tfM = t.takeOne(/\b(\d+)\s*-?\s*(?:m|min|mins|minute|minutes)\b(?:\s+(?:candles?|chart|timeframe|tf|bars?))?(?!\s+(?:opening|range|orb|high|low|close|open))/);
  if (tfM) {
    const tf = tfFromMinutes(Number(tfM[1]));
    if (tf) timeframe = tf;
    else unparsed.push(`${tfM[0].trim()} (supported candles: 1, 3, 5, 15, 30 min, 1 hour, daily)`);
  }
  if (!timeframe && t.takeOne(/\b(?:hourly|1\s*h(?:our|r)?|60\s*min(?:ute)?s?)\b(?:\s+(?:candles?|chart))?/)) timeframe = "1h";
  if (!timeframe && t.takeOne(/\b(?:daily|1\s*d|day)\s+(?:candles?|chart|timeframe|close)\b|\bdaily\b|\beod\b/)) timeframe = "1d";

  // --- side ---
  const sideM = t.takeOne(/\b(buy|long|go\s+long|kharido|khareedo|sell|short|go\s+short|write|becho)\b/);
  const side: Leg["side"] | null = sideM ? (/sell|short|write|becho/.test(sideM[1]!) ? "SELL" : "BUY") : null;

  // --- symbol, segment, option spec ---
  const sym = findSymbol(t);
  if (sym?.note) assumed.push(sym.note);
  const exchHint = t.takeOne(/\b(?:on\s+)?(nse|bse|nfo|bfo|mcx|cds)\b/)?.[1];
  const straddle = !!t.takeOne(/\bstraddle\b/);
  const strangle = !straddle && !!t.takeOne(/\bstrangle\b/);
  const rightM = t.takeOne(/\b(call|calls|ce|put|puts|pe)\b/);
  const right: "CE" | "PE" | null = rightM ? (/^(call|calls|ce)$/.test(rightM[1]!) ? "CE" : "PE") : null;
  const futM = t.takeOne(/\b(?:futures?|fut)\b/);
  const optWord = t.takeOne(/\boptions?\b/);
  const premNear = t.takeOne(/premium\s*(?:near|around|close\s+to|of|~|about)?\s*(?:₹|rs\.?)?\s*(\d+(?:\.\d+)?)|(?:₹|rs\.?)\s*(\d+(?:\.\d+)?)\s*premium/);
  const stepM = t.takeOne(/(\d+|one|two|three|four|five)\s*(?:strikes?|steps?)?\s*(itm|otm)\b|\b(itm|otm)\s*[-+]?\s*(\d+)\b|\b(atm|itm|otm)\b/);
  const pointsAway = !stepM ? t.takeOne(/(\d+)\s*(?:points?|pts)\s+(?:away|otm|out\s+of\s+the\s+money)/) : undefined;
  t.takeOne(/\b(?:at|in|out\s+of)[\s-]the[\s-]money\b/);

  const missing: string[] = [];
  if (!side) missing.push("whether to buy or sell");
  if (!sym) missing.push("which instrument (e.g. NIFTY, RELIANCE, USDINR)");

  let segment: Segment | null = null;
  if (straddle || strangle || right || premNear || optWord) segment = "options";
  else if (futM) segment = "futures";
  else if (sym) {
    if (sym.kind === "stock") {
      segment = "cash";
    } else if (sym.kind === "crypto") segment = "cash";
    else if (sym.kind === "currency" || sym.kind === "commodity") {
      segment = "futures";
      assumed.push(`${sym.symbol}: no segment stated, so read as futures.`);
    } else missing.push(`whether ${sym.symbol} is futures or options (e.g. "ATM call", "futures")`);
  }

  let exchange: Exchange | null = null;
  if (sym && segment) {
    if (sym.kind === "currency") exchange = "CDS";
    else if (sym.kind === "commodity") exchange = "MCX";
    else if (sym.kind === "crypto") exchange = "CRYPTO";
    else if (sym.kind === "index") exchange = BSE_INDICES.has(sym.symbol) ? "BFO" : "NFO";
    else if (segment === "cash") exchange = exchHint === "bse" ? "BSE" : "NSE";
    else exchange = exchHint === "bse" || exchHint === "bfo" ? "BFO" : "NFO";
  }

  // --- legs ---
  const legs: Leg[] = [];
  if (side && segment === "options") {
    let strike: NonNullable<Leg["option"]>["strike"] | null = null;
    if (premNear) strike = { mode: "PREMIUM_NEAR", premium: Number(premNear[1] ?? premNear[2]) };
    else if (stepM) {
      if (stepM[5]) {
        const mode = stepM[5].toUpperCase() as "ATM" | "ITM" | "OTM";
        if (mode === "ATM") strike = { mode: "ATM" };
        else {
          strike = { mode, steps: 1 };
          assumed.push(`"${stepM[0].trim()}" with no distance: used the nearest ${mode} strike (1 step).`);
        }
      } else {
        const steps = toNum(stepM[1] ?? stepM[4] ?? "1");
        const mode = (stepM[2] ?? stepM[3])!.toUpperCase() as "ITM" | "OTM";
        strike = { mode, steps };
      }
    } else if (pointsAway) {
      unparsed.push(`${pointsAway[0].trim()} (pick the strike as steps ITM/OTM instead of points)`);
    }
    if (straddle) {
      if (!strike) strike = { mode: "ATM" };
      legs.push({ side, option: { right: "CE", strike } }, { side, option: { right: "PE", strike } });
    } else if (strangle) {
      if (!strike) {
        strike = { mode: "OTM", steps: 1 };
        assumed.push("Strangle distance not stated: used 1 strike OTM on each side. Edit it below.");
      }
      legs.push({ side, option: { right: "CE", strike } }, { side, option: { right: "PE", strike } });
    } else if (right) {
      if (!strike) {
        strike = { mode: "ATM" };
        assumed.push("Strike not stated: used ATM.");
      }
      legs.push({ side, option: { right, strike } });
    } else missing.push("call or put (CE/PE), or straddle/strangle");
  } else if (side && segment) legs.push({ side, option: null });

  // --- expiry ---
  let expiry: Strategy["instrument"]["expiry"] = null;
  const nextExp = t.takeOne(/\bnext\s+(?:week(?:ly)?|month(?:ly)?|expiry)\b/);
  const curExp = !nextExp ? t.takeOne(/\b(?:current|this|near)\s+(?:week(?:ly)?|month(?:ly)?|expiry)\b/) : undefined;
  const cycW = t.takeOne(/\bweekly\b|\bweek\b/);
  const cycM = t.takeOne(/\bmonthly\b|\bmonth\b/);
  if (segment && segment !== "cash" && sym && exchange !== "CRYPTO") {
    const said = (nextExp?.[0] ?? curExp?.[0] ?? "") + " " + (cycW?.[0] ?? "") + " " + (cycM?.[0] ?? "");
    let cycle: "weekly" | "monthly" | null = /week/.test(said) ? "weekly" : /month/.test(said) ? "monthly" : null;
    const which: "current" | "next" = nextExp ? "next" : "current";
    if (!cycle) {
      cycle = segment === "options" && WEEKLY_EXPIRY_UNDERLYINGS.has(sym.symbol) ? "weekly" : "monthly";
      assumed.push(`Expiry not stated: used the ${which} ${cycle} expiry${cycle === "monthly" && INDEX_UNDERLYINGS.has(sym.symbol) ? ` (${sym.symbol} has no weekly expiry)` : ""}.`);
    }
    expiry = { cycle, which };
  }

  // --- entry conditions ---
  const found: { cmp: Comparison; a: number; b: number }[] = [];
  for (const m of t.s.matchAll(COND_RE)) {
    const a = m.index ?? 0;
    const b = a + m[0].length;
    if (!t.free(a, b)) continue;
    const c = buildComparison(m[1], m[2]!, m[3]!, [], assumed);
    if (!c) continue;
    if (c.timeframe) {
      if (!timeframe) timeframe = c.timeframe;
      else if (timeframe !== c.timeframe) unparsed.push(`${m[0].trim()} (mixes ${c.timeframe} with ${timeframe} candles)`);
    }
    t.mark(a, b);
    found.push({ cmp: c.cmp, a, b });
  }
  const conditions: Condition[] = [];
  if (entryAt) conditions.push({ type: "compare", left: { kind: "time" }, op: ">=", right: { kind: "time_const", value: entryAt } });
  let group: ConditionGroup;
  {
    // Join with AND, except runs joined by "or" which become nested OR groups.
    const chains: Comparison[][] = [];
    found.forEach((f, i) => {
      const prev = found[i - 1];
      const gap = prev ? t.s.slice(prev.b, f.a) : "";
      if (prev && /\bor\b|\byaa?\b/.test(gap)) chains[chains.length - 1]!.push(f.cmp);
      else chains.push([f.cmp]);
    });
    for (const ch of chains) {
      if (ch.length === 1) conditions.push(ch[0]!);
      else conditions.push({ type: "group", logic: "OR", conditions: ch });
    }
    group = conditions.length === 1 && conditions[0]!.type === "group" ? (conditions[0] as ConditionGroup) : { type: "group", logic: "AND", conditions };
  }
  if (conditions.length === 0) missing.push('an entry rule (e.g. "when 5 min close is above VWAP" or "at 9:20")');

  // Exit conditions: mirror of an entry → exit on opposite signal.
  for (const ec of exitConds) {
    const mirror = found.some((f) => isMirror(f.cmp, ec.cmp));
    if (mirror) onOpposite = true;
    else unparsed.push(`${ec.text.trim()} (custom exit conditions aren't supported yet; only the reverse of the entry)`);
  }

  // Leftovers: anything we didn't read.
  for (const f of t.leftovers()) {
    const c = cleanFragment(f);
    if (c) unparsed.push(c);
  }

  if (missing.length || !side || !sym || !segment || !exchange || legs.length === 0) {
    return {
      ok: false,
      missing,
      unparsed,
      error: `Couldn't build rules: missing ${missing.join("; ") || "key details"}. Add that to your description, or try different wording.`,
    };
  }

  // --- conventions (all listed in `assumed`) ---
  if (!timeframe) {
    timeframe = "5m";
    assumed.push("Candle timeframe not stated: used 5-minute candles.");
  }
  const session = sessionFor(exchange);
  const sessionEnd = session.allDay ? "23:59" : fromMin(session.close);
  const sessionStart = session.allDay ? "00:00" : fromMin(session.open);
  if (!windowStart) windowStart = entryAt ?? sessionStart;
  if (!windowEnd) {
    windowEnd = squareOffAt && toMin(squareOffAt) > toMin(windowStart) ? squareOffAt : sessionEnd;
  }
  if (!between && !after && !before && !entryAt) assumed.push(`Trading window not stated: entries allowed ${windowStart}–${windowEnd} IST.`);
  if (!sizing) {
    sizing = segment === "cash" ? { mode: "qty", value: 1 } : { mode: "lots", value: 1 };
    assumed.push(`Position size not stated: used ${segment === "cash" ? "quantity 1" : "1 lot"}${legs.length > 1 ? " per leg" : ""}.`);
  }
  if (!maxTrades) {
    maxTrades = 1;
    assumed.push("Trades per day not stated: used 1.");
  }
  if (!maxOpen) maxOpen = legs.length;
  if (sym.kind === "currency" && !ALLOWED_CURRENCY_PAIRS.has(sym.symbol)) {
    /* left for the validator to reject as offshore forex */
  }

  const strategy: Strategy = {
    schemaVersion: SCHEMA_VERSION,
    instrument: { exchange, symbol: sym.symbol, segment, expiry },
    timeframe,
    legs,
    entry: { conditions: group },
    exit: { stopLoss, target, trailingStop: trailing, squareOffAt, onOppositeSignal: onOpposite, basis },
    window: { start: windowStart, end: windowEnd },
    maxTradesPerDay: maxTrades,
    sizing,
    risk: { dailyLossCap, maxOpenPositions: maxOpen, killSwitch: true },
    mode: "PAPER",
  };
  return { ok: true, strategy, assumed: dedupe(assumed), unparsed: dedupe(unparsed), suggestedName: suggestName(strategy, straddle, strangle) };
}

function buildComparison(leftRaw: string | undefined, cmpRaw: string, rightRaw: string, _u: string[], assumed: string[]) {
  const right = parseOperand(rightRaw);
  if (!right) return null;
  let left: OperandParse | null = null;
  if (leftRaw && leftRaw.trim()) left = parseOperand(leftRaw);
  if (leftRaw && !left) return null;
  if (!left) left = { operand: { kind: "price", field: "close" }, notes: [] };
  // "RSI 14 above 60": a bare constant on the left with an indicator would be odd; keep as written.
  const op = parseCmp(cmpRaw, right.operand);
  for (const n of [...left.notes, ...right.notes]) assumed.push(n);
  const timeframe = left.timeframe ?? right.timeframe;
  return { cmp: { type: "compare" as const, left: left.operand, op, right: right.operand }, timeframe };
}

function isMirror(a: Comparison, b: Comparison): boolean {
  const flip: Record<CompareOp, CompareOp> = { ">": "<", ">=": "<=", "<": ">", "<=": ">=", crosses_above: "crosses_below", crosses_below: "crosses_above" };
  const same = (x: Operand, y: Operand) => JSON.stringify(x) === JSON.stringify(y);
  return same(a.left, b.left) && same(a.right, b.right) && flip[a.op] === b.op;
}

function dedupe(xs: string[]) {
  return [...new Set(xs)];
}

function suggestName(s: Strategy, straddle: boolean, strangle: boolean): string {
  const { symbol, segment } = s.instrument;
  const leg = s.legs[0];
  const kind = straddle ? "straddle" : strangle ? "strangle" : segment === "options" ? `${leg?.option?.strike.mode ?? ""} ${leg?.option?.right ?? ""}`.trim() : segment === "futures" ? "futures" : "";
  const inds = new Set<string>();
  const visit = (g: ConditionGroup) =>
    g.conditions.forEach((c) => {
      if (c.type === "group") return visit(c);
      for (const o of [c.left, c.right]) {
        if (["vwap", "ema", "sma", "rsi", "macd", "bollinger", "supertrend", "atr"].includes(o.kind)) inds.add(o.kind.toUpperCase());
        if (o.kind === "prev_day") inds.add(`PD ${o.field}`);
        if (o.kind === "opening_range") inds.add("ORB");
        if (o.kind === "time_const") inds.add(o.value);
      }
    });
  visit(s.entry.conditions);
  const verb = s.legs[0]?.side === "SELL" ? "Short" : "Long";
  return `${verb} ${symbol}${kind ? ` ${kind}` : ""}${inds.size ? ` · ${[...inds].slice(0, 3).join(" + ")}` : ""}`.slice(0, 80);
}
