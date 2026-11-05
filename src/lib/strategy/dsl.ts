import { z } from "zod";

/**
 * Strategy Passport rule DSL, schemaVersion 1.
 *
 * This is the single source of truth for what a strategy does. The compiler (Gemini or the
 * rules parser) only ever produces one of these; the user edits and approves one of these;
 * the paper engine (Step 4) will run exactly this. Nothing else is executed.
 *
 * All times are IST, "HH:MM" 24-hour.
 */

export const SCHEMA_VERSION = 1 as const;

export const EXCHANGES = ["NSE", "BSE", "NFO", "BFO", "CDS", "MCX", "CRYPTO"] as const;
export const SEGMENTS = ["cash", "futures", "options"] as const;
export const TIMEFRAMES = ["1m", "3m", "5m", "15m", "30m", "1h", "1d"] as const;
export const SIDES = ["BUY", "SELL"] as const;
export const OPTION_RIGHTS = ["CE", "PE"] as const;
export const EXPIRY_CYCLES = ["weekly", "monthly"] as const;
export const EXPIRY_WHICH = ["current", "next"] as const;
export const COMPARE_OPS = [">", ">=", "<", "<=", "crosses_above", "crosses_below"] as const;
export const LOGIC = ["AND", "OR"] as const;
export const MODES = ["PAPER", "LIVE"] as const;

export type Exchange = (typeof EXCHANGES)[number];
export type Segment = (typeof SEGMENTS)[number];
export type Timeframe = (typeof TIMEFRAMES)[number];
export type Side = (typeof SIDES)[number];
export type CompareOp = (typeof COMPARE_OPS)[number];

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const timeSchema = z.string().regex(HHMM, "Use 24-hour time like 09:30.");

const period = z.number().int("Must be a whole number.").min(1, "Must be at least 1.").max(500, "Must be 500 or less.");
const positive = z.number().positive("Must be more than 0.");

// ---------- operands ----------

export const operandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("price"), field: z.enum(["open", "high", "low", "close", "ltp"]) }),
  z.object({ kind: z.literal("vwap") }),
  z.object({ kind: z.literal("sma"), period }),
  z.object({ kind: z.literal("ema"), period }),
  z.object({ kind: z.literal("rsi"), period }),
  z.object({
    kind: z.literal("macd"),
    fast: period,
    slow: period,
    signal: period,
    line: z.enum(["macd", "signal", "hist"]),
  }),
  z.object({
    kind: z.literal("bollinger"),
    period,
    stddev: z.number().positive("Must be more than 0.").max(5, "Must be 5 or less."),
    band: z.enum(["upper", "middle", "lower"]),
  }),
  z.object({ kind: z.literal("atr"), period }),
  z.object({ kind: z.literal("supertrend"), period, multiplier: z.number().positive("Must be more than 0.").max(10, "Must be 10 or less.") }),
  z.object({ kind: z.literal("prev_day"), field: z.enum(["high", "low", "close"]) }),
  z.object({ kind: z.literal("opening_range"), minutes: z.number().int().min(1).max(375), field: z.enum(["high", "low"]) }),
  z.object({ kind: z.literal("const"), value: z.number().finite() }),
  z.object({ kind: z.literal("time") }),
  z.object({ kind: z.literal("time_const"), value: timeSchema }),
]);
export type Operand = z.infer<typeof operandSchema>;
export type OperandKind = Operand["kind"];
export const OPERAND_KINDS = operandSchema.options.map((o) => o.shape.kind.value) as OperandKind[];

// ---------- conditions ----------

export const comparisonSchema = z.object({
  type: z.literal("compare"),
  left: operandSchema,
  op: z.enum(COMPARE_OPS),
  right: operandSchema,
});
export type Comparison = z.infer<typeof comparisonSchema>;

export type ConditionGroup = { type: "group"; logic: "AND" | "OR"; conditions: Array<Comparison | ConditionGroup> };
export type Condition = Comparison | ConditionGroup;

export const conditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal("group"),
    logic: z.enum(LOGIC),
    conditions: z.array(z.union([comparisonSchema, conditionGroupSchema])).max(12, "Keep a group to 12 conditions or fewer."),
  }),
);

// ---------- instrument & legs ----------

export const strikeSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ATM") }),
  z.object({ mode: z.literal("ITM"), steps: z.number().int().min(1).max(20) }),
  z.object({ mode: z.literal("OTM"), steps: z.number().int().min(1).max(20) }),
  z.object({ mode: z.literal("PREMIUM_NEAR"), premium: positive }),
]);
export type Strike = z.infer<typeof strikeSchema>;

export const optionSpecSchema = z.object({ right: z.enum(OPTION_RIGHTS), strike: strikeSchema });
export type OptionSpec = z.infer<typeof optionSpecSchema>;

export const legSchema = z.object({
  side: z.enum(SIDES),
  option: optionSpecSchema.nullable(),
});
export type Leg = z.infer<typeof legSchema>;

export const instrumentSchema = z.object({
  exchange: z.enum(EXCHANGES),
  /** Trading symbol for cash; underlying for futures/options (NIFTY, RELIANCE, USDINR, CRUDEOIL, BTCINR). */
  symbol: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter a symbol.")
    .max(24, "Symbol is too long.")
    .regex(/^[A-Z0-9&_-]+$/, "Use letters, numbers, & or - only."),
  segment: z.enum(SEGMENTS),
  expiry: z.object({ cycle: z.enum(EXPIRY_CYCLES), which: z.enum(EXPIRY_WHICH) }).nullable(),
});
export type Instrument = z.infer<typeof instrumentSchema>;

// ---------- exits, sizing, risk ----------

export const stopLossSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("percent"), value: positive }),
  z.object({ type: z.literal("points"), value: positive }),
  z.object({ type: z.literal("atr"), value: positive, atrPeriod: period }),
]);
export type StopLoss = z.infer<typeof stopLossSchema>;

export const targetSchema = z.object({ type: z.enum(["percent", "points"]), value: positive });
export const trailingSchema = z.object({ type: z.enum(["percent", "points"]), value: positive });

export const exitSchema = z.object({
  stopLoss: stopLossSchema.nullable(),
  target: targetSchema.nullable(),
  trailingStop: trailingSchema.nullable(),
  squareOffAt: timeSchema.nullable(),
  onOppositeSignal: z.boolean(),
  /** For multi-leg positions: apply % / points to each leg or to the combined premium. */
  basis: z.enum(["per_leg", "combined"]),
});
export type ExitRules = z.infer<typeof exitSchema>;

export const sizingSchema = z.object({
  mode: z.enum(["lots", "qty", "capital_pct"]),
  value: positive,
});
export type Sizing = z.infer<typeof sizingSchema>;

export const riskSchema = z.object({
  dailyLossCap: z.number().positive("Must be more than ₹0.").nullable(),
  maxOpenPositions: z.number().int().min(1).max(50),
  killSwitch: z.boolean(),
});
export type Risk = z.infer<typeof riskSchema>;

// ---------- the strategy ----------

export const strategySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  instrument: instrumentSchema,
  timeframe: z.enum(TIMEFRAMES),
  legs: z.array(legSchema).min(1, "Add at least one leg.").max(4, "Up to 4 legs."),
  entry: z.object({ conditions: conditionGroupSchema }),
  exit: exitSchema,
  window: z.object({ start: timeSchema, end: timeSchema }),
  maxTradesPerDay: z.number().int().min(1).max(50),
  sizing: sizingSchema,
  risk: riskSchema,
  mode: z.enum(MODES),
});
export type Strategy = z.infer<typeof strategySchema>;

/** Parse helper that never throws. */
export function parseStrategy(input: unknown) {
  return strategySchema.safeParse(input);
}

/** A neutral starting point the UI uses when a field needs a fresh value. Not a suggestion. */
export function defaultOperand(kind: OperandKind): Operand {
  switch (kind) {
    case "price": return { kind, field: "close" };
    case "vwap": return { kind };
    case "sma": return { kind, period: 20 };
    case "ema": return { kind, period: 20 };
    case "rsi": return { kind, period: 14 };
    case "macd": return { kind, fast: 12, slow: 26, signal: 9, line: "macd" };
    case "bollinger": return { kind, period: 20, stddev: 2, band: "upper" };
    case "atr": return { kind, period: 14 };
    case "supertrend": return { kind, period: 10, multiplier: 3 };
    case "prev_day": return { kind, field: "high" };
    case "opening_range": return { kind, minutes: 15, field: "high" };
    case "const": return { kind, value: 0 };
    case "time": return { kind };
    case "time_const": return { kind, value: "09:30" };
  }
}

/** Walk every comparison in a group, depth-first, with its JSON path. */
export function walkComparisons(
  group: ConditionGroup,
  visit: (c: Comparison, path: (string | number)[]) => void,
  base: (string | number)[] = ["entry", "conditions"],
) {
  group.conditions.forEach((c, i) => {
    const p = [...base, "conditions", i];
    if (c.type === "compare") visit(c, p);
    else walkComparisons(c, visit, p);
  });
}

export function groupDepth(group: ConditionGroup): number {
  let d = 1;
  for (const c of group.conditions) if (c.type === "group") d = Math.max(d, 1 + groupDepth(c));
  return d;
}

/** Stable JSON (sorted keys) for equality checks between versions. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}
