/** RFC 4180 CSV with protection against spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = value instanceof Date ? formatIst(value) : String(value);
  const isPhone = /^\+\d[\d\s-]*$/.test(s);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && !isPhone)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

const IST = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});

/** "2026-11-06 00:25:00 IST" — spreadsheet friendly, in Indian time. */
export function formatIst(d: Date): string {
  const p = Object.fromEntries(IST.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}:${p.second} IST`;
}
