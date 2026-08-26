// ===========================================================================
//  format.ts — presentation helpers. Money is always kyat, always integer.
// ===========================================================================

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 1500 -> "Ks 1,500" */
export function kyats(amountCents: number | null | undefined) {
  return `Ks ${numberFormat.format(Math.round(Number(amountCents ?? 0)))}`;
}

/** 1500 -> "1,500" (for tables where the column header already says Ks) */
export function amount(amountCents: number | null | undefined) {
  return numberFormat.format(Math.round(Number(amountCents ?? 0)));
}

export function percent(value: number | null | undefined, digits = 1) {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function dateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormat.format(date);
}

export function clock(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : timeFormat.format(date);
}

export function day(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormat.format(date);
}

/** "in 2 h 15 m" / "12 m ago" */
export function relative(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const deltaMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const absolute = Math.abs(deltaMinutes);
  const label = absolute >= 60 ? `${Math.floor(absolute / 60)} h ${absolute % 60} m` : `${absolute} m`;
  if (absolute < 1) return "now";
  return deltaMinutes > 0 ? `in ${label}` : `${label} ago`;
}

export function monthName(month: string) {
  const parsed = new Date(`${month}-01T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? month
    : parsed.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export function titleCase(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

export function initials(name: string | null | undefined) {
  if (!name) return "BG";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? "")
    .join("");
}
