import { describe, expect, it } from "vitest";
import { canonicalJson, defaultOperand, groupDepth, OPERAND_KINDS, parseStrategy, strategySchema, walkComparisons } from "@/lib/strategy/dsl";
import { clone, niftyCall } from "./fixtures/strategies";

describe("Strategy DSL schema (schemaVersion 1)", () => {
  it("accepts a complete strategy and round-trips through JSON", () => {
    const s = niftyCall();
    const r = parseStrategy(JSON.parse(JSON.stringify(s)));
    expect(r.success).toBe(true);
    expect(r.data).toEqual(s);
  });

  it("requires schemaVersion 1", () => {
    const s = { ...niftyCall(), schemaVersion: 2 };
    expect(parseStrategy(s).success).toBe(false);
  });

  it("rejects unknown exchanges, timeframes and malformed times", () => {
    const a = clone(niftyCall()) as unknown as { instrument: { exchange: string } };
    a.instrument.exchange = "NYSE";
    expect(parseStrategy(a).success).toBe(false);
    const b = clone(niftyCall()) as unknown as { timeframe: string };
    b.timeframe = "2m";
    expect(parseStrategy(b).success).toBe(false);
    const c = clone(niftyCall());
    c.window.start = "9:30";
    expect(parseStrategy(c).success).toBe(false);
    const d = clone(niftyCall());
    d.exit.squareOffAt = "25:00";
    expect(parseStrategy(d).success).toBe(false);
  });

  it("normalises symbols to uppercase and rejects odd characters", () => {
    const s = clone(niftyCall());
    s.instrument.symbol = "nifty";
    expect(parseStrategy(s).data?.instrument.symbol).toBe("NIFTY");
    s.instrument.symbol = "NIFTY 50!";
    expect(parseStrategy(s).success).toBe(false);
  });

  it("supports every operand kind, nested AND/OR groups and multi-leg positions", () => {
    const s = clone(niftyCall());
    const many = {
      type: "group" as const,
      logic: "OR" as const,
      conditions: OPERAND_KINDS.filter((k) => k !== "time" && k !== "time_const").map((k) => ({ type: "compare" as const, left: defaultOperand(k), op: ">" as const, right: { kind: "const" as const, value: 1 } })),
    };
    s.entry.conditions = {
      type: "group",
      logic: "AND",
      conditions: [many, { type: "group", logic: "AND", conditions: [{ type: "compare", left: { kind: "time" }, op: ">=", right: { kind: "time_const", value: "09:20" } }] }],
    };
    s.legs = [
      { side: "SELL", option: { right: "CE", strike: { mode: "OTM", steps: 2 } } },
      { side: "SELL", option: { right: "PE", strike: { mode: "PREMIUM_NEAR", premium: 50 } } },
    ];
    expect(parseStrategy(s).success).toBe(true);
    expect(groupDepth(s.entry.conditions)).toBe(2);
    let n = 0;
    walkComparisons(s.entry.conditions, () => n++);
    expect(n).toBe(OPERAND_KINDS.length - 1);
  });

  it("caps a group at 12 conditions", () => {
    const s = clone(niftyCall());
    const c = s.entry.conditions.conditions[0]!;
    s.entry.conditions.conditions = Array.from({ length: 13 }, () => c);
    expect(parseStrategy(s).success).toBe(false);
  });

  it("limits legs to 1–4 and validates numeric ranges", () => {
    const s = clone(niftyCall());
    s.legs = [];
    expect(parseStrategy(s).success).toBe(false);
    const t = clone(niftyCall());
    t.exit.stopLoss = { type: "percent", value: -5 };
    expect(parseStrategy(t).success).toBe(false);
    const u = clone(niftyCall());
    u.entry.conditions.conditions[1] = { type: "compare", left: { kind: "rsi", period: 0 }, op: ">", right: { kind: "const", value: 60 } };
    expect(parseStrategy(u).success).toBe(false);
  });

  it("produces a JSON Schema for the LLM prompt", async () => {
    const { z } = await import("zod");
    const js = z.toJSONSchema(strategySchema, { io: "input", unrepresentable: "any" }) as { properties: Record<string, unknown> };
    expect(Object.keys(js.properties)).toEqual(expect.arrayContaining(["schemaVersion", "instrument", "legs", "entry", "exit", "risk", "mode"]));
  });

  it("canonicalJson ignores key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});
