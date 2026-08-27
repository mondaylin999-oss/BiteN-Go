// ===========================================================================
//  time.ts — Myanmar (Asia/Yangon) calendar helpers.
//  The canteen pre-order window is a Myanmar-local rule, so the hour and date
//  are always taken in that timezone regardless of the server's own clock.
// ===========================================================================

export const MYANMAR_TIMEZONE = "Asia/Yangon";

/** Hour of day 0–23 in Myanmar. */
export function yangonHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en", { timeZone: MYANMAR_TIMEZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** "YYYY-MM-DD" in Myanmar — the key food availability resets on. */
export function yangonDateKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: MYANMAR_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** A readable Myanmar timestamp for logs and the dashboard header. */
export function yangonTimeLabel(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MYANMAR_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
}

/** "YYYY-MM" in Myanmar — the month a ferry seat is sold for. */
export function yangonMonthKey(now = new Date()) {
  return yangonDateKey(now).slice(0, 7);
}

/** The month `count` months after `month` ("2026-08" + 2 -> "2026-10"). */
export function addMonths(month: string, count: number) {
  const [year, index] = month.split("-").map(Number);
  const zeroBased = (year ?? 1970) * 12 + ((index ?? 1) - 1) + count;
  return `${String(Math.floor(zeroBased / 12)).padStart(4, "0")}-${String((zeroBased % 12) + 1).padStart(2, "0")}`;
}

/** Is this a real "YYYY-MM"? */
export function isMonthKey(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** How many days that month has. */
export function daysInMonth(month: string) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, index ?? 1, 0)).getUTCDate();
}

/** A readable month name: "2026-09" -> "September 2026". */
export function monthLabel(month: string) {
  if (!isMonthKey(month)) return month;
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, index! - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The instant a departure happens, from a Myanmar wall-clock date and time.
 * Myanmar is UTC+06:30 all year — the country has never used daylight saving —
 * so the conversion is a fixed offset rather than a timezone lookup.
 */
export const MYANMAR_UTC_OFFSET_MINUTES = 6 * 60 + 30;

export function yangonWallClockToDate(month: string, day: number, time: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return new Date(Date.UTC(year!, monthIndex! - 1, day, hour ?? 0, minute ?? 0) - MYANMAR_UTC_OFFSET_MINUTES * 60_000);
}
