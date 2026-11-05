import type { Exchange } from "./dsl";

/**
 * India market reference data used by the validator.
 *
 * VERIFY WITH THE EXCHANGE. Lot sizes and expiry rules are revised by NSE/BSE/MCX
 * from time to time. Override any lot size without a code change via the
 * LOT_SIZE_OVERRIDES env var, e.g. LOT_SIZE_OVERRIDES="NIFTY=65,BANKNIFTY=30".
 */
export const MARKET_DATA_LAST_UPDATED = "2026-11-06";
export const MARKET_DATA_SOURCES = [
  "NSE circular NSE/FAOP/70616 (3 Oct 2025): NIFTY 65, BANKNIFTY 30, FINNIFTY 60, MIDCPNIFTY 120, NIFTYNXT50 25",
  "BSE notice 20241021-13: SENSEX 20, BANKEX 30, SENSEX50 75",
  "SEBI circular (1 Oct 2024, effective 20 Nov 2024): weekly expiry for one benchmark index per exchange (NSE: NIFTY, BSE: SENSEX)",
  "NSE CDS contract specifications: USDINR/EURINR/GBPINR/EURUSD/GBPUSD/USDJPY lot 1,000 base units, JPYINR 1,00,000 yen",
];

/** Trading sessions in IST, minutes since midnight. Crypto trades 24x7. */
export type Session = { open: number; close: number; label: string; allDay?: boolean };

export function sessionFor(exchange: Exchange): Session {
  switch (exchange) {
    case "NSE":
    case "BSE":
    case "NFO":
    case "BFO":
      return { open: toMin("09:15"), close: toMin("15:30"), label: "09:15–15:30 IST" };
    case "CDS":
      return { open: toMin("09:00"), close: toMin("17:00"), label: "09:00–17:00 IST" };
    case "MCX":
      return { open: toMin("09:00"), close: toMin("23:30"), label: "09:00–23:30 IST" };
    case "CRYPTO":
      return { open: 0, close: 24 * 60 - 1, label: "24x7", allDay: true };
  }
}

/** Contract multipliers (units per lot) for common F&O underlyings. */
export const DEFAULT_LOT_SIZES: Record<string, number> = {
  // NSE index derivatives (NFO)
  NIFTY: 65,
  BANKNIFTY: 30,
  FINNIFTY: 60,
  MIDCPNIFTY: 120,
  NIFTYNXT50: 25,
  // BSE index derivatives (BFO)
  SENSEX: 20,
  BANKEX: 30,
  SENSEX50: 75,
  // A few liquid NSE stock derivatives (exchange contract master, Oct 2026)
  RELIANCE: 500,
  HDFCBANK: 650,
  ICICIBANK: 700,
  INFY: 400,
  SBIN: 750,
  // Exchange-traded currency derivatives (CDS)
  USDINR: 1000,
  EURINR: 1000,
  GBPINR: 1000,
  JPYINR: 100000,
  EURUSD: 1000,
  GBPUSD: 1000,
  USDJPY: 1000,
};

export function lotSizes(env: string | undefined = typeof process !== "undefined" ? process.env?.LOT_SIZE_OVERRIDES : undefined): Record<string, number> {
  const out = { ...DEFAULT_LOT_SIZES };
  if (!env) return out;
  for (const pair of env.split(",")) {
    const [k, v] = pair.split("=").map((s) => s.trim());
    const n = Number(v);
    if (k && Number.isInteger(n) && n > 0) out[k.toUpperCase()] = n;
  }
  return out;
}

export const INDEX_UNDERLYINGS = new Set(["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50", "SENSEX", "BANKEX", "SENSEX50"]);
export const BSE_INDICES = new Set(["SENSEX", "BANKEX", "SENSEX50"]);

/** Underlyings that still have weekly expiries (one benchmark per exchange). */
export const WEEKLY_EXPIRY_UNDERLYINGS = new Set(["NIFTY", "SENSEX"]);

/** The only currency pairs Indian residents may trade: exchange-traded on CDS. */
export const ALLOWED_CURRENCY_PAIRS = new Set(["USDINR", "EURINR", "GBPINR", "JPYINR", "EURUSD", "GBPUSD", "USDJPY"]);

const ISO_CCY = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF", "CNH", "CNY", "HKD", "SGD", "ZAR", "MXN", "SEK", "NOK", "TRY", "XAU", "XAG", "INR", "AED"];
/** Looks like a forex pair (6 letters made of two currency codes). */
export function looksLikeForexPair(symbol: string): boolean {
  const s = symbol.toUpperCase().replace(/[^A-Z]/g, "");
  if (s.length !== 6) return false;
  return ISO_CCY.includes(s.slice(0, 3)) && ISO_CCY.includes(s.slice(3));
}

/** Strike step for common index options (used only to describe ITM/OTM n in summaries). */
export const STRIKE_STEPS: Record<string, number> = {
  NIFTY: 50, BANKNIFTY: 100, FINNIFTY: 50, MIDCPNIFTY: 25, NIFTYNXT50: 100, SENSEX: 100, BANKEX: 100,
};

export function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}
export function fromMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
