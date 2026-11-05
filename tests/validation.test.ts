import { describe, expect, it } from "vitest";
import { changePasswordSchema, fieldErrors, loginSchema, passwordSchema, signupSchema, waitlistSchema } from "@/lib/validation";

describe("waitlistSchema", () => {
  it("accepts a full valid entry and normalises email + phone", () => {
    const r = waitlistSchema.parse({
      name: "  Dev Thakur ", email: "Dev@Example.COM ", phone: "+91 98765-43210", broker: "Zerodha", market: "Index options",
    });
    expect(r.name).toBe("Dev Thakur");
    expect(r.email).toBe("dev@example.com");
    expect(r.phone).toBe("+919876543210");
  });

  it("treats empty optional fields as missing", () => {
    const r = waitlistSchema.parse({ name: "A", email: "a@b.co", phone: "", broker: "", market: "" });
    expect(r.phone).toBeUndefined();
    expect(r.broker).toBeUndefined();
  });

  it("rejects bad email, unknown broker, bad phone and HTML in name", () => {
    const r = waitlistSchema.safeParse({ name: "<script>", email: "nope", phone: "12", broker: "RandomBroker" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const f = fieldErrors(r.error);
      expect(Object.keys(f).sort()).toEqual(["broker", "email", "name", "phone"]);
    }
  });
});

describe("passwordSchema", () => {
  it.each([
    ["short1", "Use at least 10 characters."],
    ["onlyletterslong", "Include at least one number."],
    ["1234567890123", "Include at least one letter."],
    ["password123", "That password is too common. Pick something less guessable."],
  ])("rejects %s", (pw, message) => {
    const r = passwordSchema.safeParse(pw);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(message);
  });

  it("rejects passwords over bcrypt's 72-byte limit", () => {
    expect(passwordSchema.safeParse("a1".repeat(40)).success).toBe(false);
  });

  it("accepts a reasonable password", () => {
    expect(passwordSchema.safeParse("nifty-wave-2026").success).toBe(true);
  });
});

describe("auth schemas", () => {
  it("signup requires name, email and a strong password", () => {
    expect(signupSchema.safeParse({ name: "Dev", email: "dev@tw.in", password: "nifty-wave-2026" }).success).toBe(true);
    expect(signupSchema.safeParse({ name: "", email: "dev@tw.in", password: "nifty-wave-2026" }).success).toBe(false);
  });

  it("login lowercases email and requires a password", () => {
    expect(loginSchema.parse({ email: "DEV@TW.IN", password: "x" }).email).toBe("dev@tw.in");
    expect(loginSchema.safeParse({ email: "dev@tw.in", password: "" }).success).toBe(false);
  });

  it("change password refuses reusing the current password", () => {
    const r = changePasswordSchema.safeParse({ currentPassword: "nifty-wave-2026", newPassword: "nifty-wave-2026" });
    expect(r.success).toBe(false);
    if (!r.success) expect(fieldErrors(r.error).newPassword).toMatch(/different/);
  });
});
