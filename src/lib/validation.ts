import { z } from "zod";

import { BROKERS, MARKETS } from "./options";

export { BROKERS, MARKETS };

const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

export const emailSchema = z
  .string({ error: "Please enter your email." })
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .pipe(z.email({ error: "Please enter a valid email." }));

export const nameSchema = z
  .string({ error: "Please enter your name." })
  .trim()
  .min(1, "Please enter your name.")
  .max(80, "Please keep your name under 80 characters.")
  .refine((v) => !/[<>]/.test(v), "Please remove < and > from your name.");

/** Indian or international mobile: optional +, 8 to 15 digits, spaces/dashes allowed. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .refine((v) => /^\+?\d{8,15}$/.test(v), "Please enter a valid mobile number, e.g. +91 98765 43210.");

export const waitlistSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: z.preprocess(emptyToUndefined, phoneSchema.optional()),
  broker: z.preprocess(emptyToUndefined, z.enum(BROKERS, { error: "Please pick a broker from the list." }).optional()),
  market: z.preprocess(emptyToUndefined, z.enum(MARKETS, { error: "Please pick a market from the list." }).optional()),
  source: z.preprocess(emptyToUndefined, z.string().trim().max(120).optional()),
  // Honeypot: real people never fill this in.
  botcheck: z.unknown().optional(),
});
export type WaitlistInput = z.infer<typeof waitlistSchema>;

const COMMON_PASSWORDS = new Set([
  "password123", "password1234", "qwerty12345", "1234567890a", "iloveyou123",
  "tradingwave1", "tradingwave123", "letmein1234", "welcome12345", "admin123456",
]);

/** Password rules: 10+ chars, at least one letter and one number, max 72 bytes (bcrypt limit), not a common password. */
export const passwordSchema = z
  .string({ error: "Please enter a password." })
  .min(10, "Use at least 10 characters.")
  .refine((v) => new TextEncoder().encode(v).length <= 72, "Please keep your password under 72 characters.")
  .refine((v) => /[A-Za-z]/.test(v), "Include at least one letter.")
  .refine((v) => /\d/.test(v), "Include at least one number.")
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), "That password is too common. Pick something less guessable.");

export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Please enter your password." }).min(1, "Please enter your password.").max(200),
});

export const profileSchema = z.object({ name: nameSchema });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Please enter your current password.").max(200),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    message: "Your new password must be different from the current one.",
    path: ["newPassword"],
  });

/** Flatten zod issues into { field: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
