import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { canonicalJson, type Strategy } from "./dsl";
import { lotSizes } from "./market";
import { summaryText } from "./summary";
import { validateStrategy } from "./validate";

export const STRATEGY_BODY_LIMIT = 60_000;
export const ENGINES = ["gemini", "rules", "manual"] as const;
export type StoredEngine = (typeof ENGINES)[number];

export const strategyNameSchema = z
  .string({ error: "Give the strategy a name." })
  .trim()
  .min(1, "Give the strategy a name.")
  .max(80, "Keep the name under 80 characters.")
  .refine((v) => !/[<>]/.test(v), "Please remove < and > from the name.");

export const sourceTextSchema = z.string().trim().max(2000, "Keep the description under 2,000 characters.");

export const compileBodySchema = z.object({
  text: z.string({ error: "Describe your strategy first." }).trim().min(8, "Describe your strategy in a sentence or two.").max(2000, "Keep the description under 2,000 characters."),
});

export const createBodySchema = z.object({
  name: strategyNameSchema,
  sourceText: sourceTextSchema,
  engine: z.enum(ENGINES),
  dsl: z.unknown(),
  approve: z.boolean().optional().default(false),
  confirmPaper: z.boolean().optional().default(false),
  editedAfterDraft: z.boolean().optional().default(false),
});

export const versionBodySchema = z.object({
  name: strategyNameSchema.optional(),
  sourceText: sourceTextSchema.optional(),
  engine: z.enum(ENGINES).optional(),
  dsl: z.unknown(),
  approve: z.boolean().optional().default(false),
  confirmPaper: z.boolean().optional().default(false),
});

export const approveBodySchema = z.object({ versionId: z.string().min(1), confirmPaper: z.boolean() });
export const archiveBodySchema = z.object({ archive: z.boolean() });

export const PAPER_CONFIRM_TEXT = "I understand TradingWave will only paper trade this until I connect a broker";

export type StoredValidation = { ok: boolean; errors: { path: string; code: string; message: string }[]; warnings: { path: string; code: string; message: string }[] };

/** Server-side validation with the configured lot sizes. Returns the normalised strategy. */
export function serverValidate(dsl: unknown) {
  const v = validateStrategy(dsl, { lotSizes: lotSizes() });
  const stored: StoredValidation = { ok: v.ok, errors: v.errors, warnings: v.warnings };
  return { v, stored };
}

export async function findOwned(userId: string, id: string) {
  return db.strategy.findFirst({ where: { id, userId } });
}

export async function currentVersion(strategyId: string, currentVersionId: string | null) {
  if (!currentVersionId) return null;
  return db.strategyVersion.findFirst({ where: { id: currentVersionId, strategyId } });
}

export function sameRules(a: Strategy, dslJson: string): boolean {
  try {
    return canonicalJson(a) === canonicalJson(JSON.parse(dslJson));
  } catch {
    return false;
  }
}

/** Creates the next version number atomically. Never mutates an existing version. */
export async function appendVersion(args: {
  strategyId: string;
  userId: string;
  strategy: Strategy;
  sourceText: string;
  engine: StoredEngine;
  validation: StoredValidation;
  approve: boolean;
  name?: string;
  eventDetail?: string;
}) {
  return db.$transaction(async (tx) => {
    const last = await tx.strategyVersion.findFirst({ where: { strategyId: args.strategyId }, orderBy: { version: "desc" }, select: { version: true } });
    const versionNo = (last?.version ?? 0) + 1;
    const now = new Date();
    const version = await tx.strategyVersion.create({
      data: {
        strategyId: args.strategyId,
        version: versionNo,
        sourceText: args.sourceText,
        dsl: JSON.stringify(args.strategy),
        summary: summaryText(args.strategy),
        engine: args.engine,
        validation: JSON.stringify(args.validation),
        approvedAt: args.approve ? now : null,
      },
    });
    await tx.strategy.update({
      where: { id: args.strategyId },
      data: { currentVersionId: version.id, status: args.approve ? "APPROVED" : "DRAFT", ...(args.name ? { name: args.name } : {}) },
    });
    await tx.strategyEvent.create({
      data: { strategyId: args.strategyId, userId: args.userId, type: "version", version: versionNo, detail: args.eventDetail ?? `Saved version ${versionNo} (${args.engine})` },
    });
    if (args.approve) {
      await tx.strategyEvent.create({ data: { strategyId: args.strategyId, userId: args.userId, type: "approved", version: versionNo, detail: `Approved version ${versionNo} for paper trading` } });
    }
    return version;
  });
}
