export const CLINIC_TIMEZONE = import.meta.env.VITE_CLINIC_TIMEZONE || "Asia/Kolkata";

export function formatDateTime(value: string, timeZone = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatDate(value: string, timeZone = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

export function formatTime(value: string, timeZone = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function greetingForNow(now = new Date(), timeZone = CLINIC_TIMEZONE): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now),
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function toDateInputValue(date = new Date(), timeZone = CLINIC_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function addDaysToInput(days: number, from = new Date(), timeZone = CLINIC_TIMEZONE): string {
  const today = toDateInputValue(from, timeZone);
  const [year, month, day] = today.split("-").map(Number);
  const utc = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

export function remainingHoldSeconds(holdExpiresAt: string | null | undefined, now = Date.now()): number | null {
  if (!holdExpiresAt) return null;
  return Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - now) / 1000));
}

export function isHoldExpired(holdExpiresAt: string | null | undefined, now = Date.now()): boolean {
  const remaining = remainingHoldSeconds(holdExpiresAt, now);
  return remaining !== null && remaining <= 0;
}

export function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}
