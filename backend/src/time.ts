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
