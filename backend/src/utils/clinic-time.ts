import { env } from "../config/env.js";

function zonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "0";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

export function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function clinicTimeZone(timeZone = env.CLINIC_TIMEZONE): string {
  return timeZone;
}

/** Convert a civil date+time in the clinic timezone to a UTC Date. */
export function clinicLocalToUtc(
  dateStr: string,
  time: string,
  timeZone = env.CLINIC_TIMEZONE,
): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const naive = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hours ?? 0, minutes ?? 0, 0);
  const first = new Date(naive);
  const instant = new Date(naive - timeZoneOffsetMs(first, timeZone));
  return new Date(naive - timeZoneOffsetMs(instant, timeZone));
}

export function combineLocalDateAndTime(
  dateStr: string,
  time: string,
  timeZone = env.CLINIC_TIMEZONE,
): Date {
  return clinicLocalToUtc(dateStr, time, timeZone);
}

export function toClinicDateInput(date: Date, timeZone = env.CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function toDateInput(date: Date, timeZone = env.CLINIC_TIMEZONE): string {
  return toClinicDateInput(date, timeZone);
}

/** Calendar date for Prisma `@db.Date` values stored at UTC midnight. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function weekdayOf(dateStr: string, timeZone = env.CLINIC_TIMEZONE): number {
  const noon = clinicLocalToUtc(dateStr, "12:00", timeZone);
  const short = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(noon);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[short] ?? 0;
}

export function clinicDayBounds(instant = new Date(), timeZone = env.CLINIC_TIMEZONE) {
  const dateStr = toClinicDateInput(instant, timeZone);
  return {
    dateStr,
    start: clinicLocalToUtc(dateStr, "00:00", timeZone),
    endExclusive: clinicLocalToUtc(addCalendarDays(dateStr, 1), "00:00", timeZone),
  };
}

export function formatSlotLabel(date: Date, timeZone = env.CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
