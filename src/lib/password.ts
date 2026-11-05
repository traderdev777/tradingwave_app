import bcrypt from "bcryptjs";

const COST = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

let dummy: Promise<string> | null = null;
/** Runs a full bcrypt compare against a throwaway hash so a missing account takes as long as a wrong password. */
export async function burnPasswordCheck(plain: string): Promise<false> {
  dummy ??= bcrypt.hash("tradingwave-timing-equaliser", COST);
  await bcrypt.compare(plain, await dummy);
  return false;
}
