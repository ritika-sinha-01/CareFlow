export function normalizeOrigin(value: string): string {
  return value.trim().replace(/^["']/, "").replace(/["']$/, "").replace(/\/+$/, "");
}

export function parseAllowedOrigins(corsOrigin: string, frontendUrl: string): Set<string> {
  const values = [...corsOrigin.split(","), frontendUrl].map(normalizeOrigin).filter(Boolean);
  return new Set(values);
}

export function isAllowedCorsOrigin(
  origin: string | undefined,
  allowed: Set<string>,
  allowLocalhost: boolean,
): boolean {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (allowed.has(normalized)) return true;
  if (allowLocalhost && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized)) {
    return true;
  }
  return false;
}
