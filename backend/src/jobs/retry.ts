export const RETRY_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

export function nextRetryAt(retryCount: number, now = Date.now()): Date {
  const delay = RETRY_BACKOFF_MS[Math.min(retryCount - 1, RETRY_BACKOFF_MS.length - 1)] ?? 600_000;
  return new Date(now + delay);
}
