export function normalizeOrigin(value: string): string {
  return value.trim().replace(/^["']/, "").replace(/["']$/, "").replace(/\/+$/, "");
}

export function parseAllowedOrigins(corsOrigin: string, frontendUrl: string): Set<string> {
  const values = [...corsOrigin.split(","), frontendUrl].map(normalizeOrigin).filter(Boolean);
  return new Set(values);
}

function vercelProjectPrefix(hostname: string): string | null {
  if (!hostname.endsWith(".vercel.app")) return null;
  const name = hostname.slice(0, -".vercel.app".length);
  const parts = name.split("-");
  if (parts.length < 3) return null;
  return parts.slice(0, -1).join("-");
}

export function isVercelPreviewOrigin(origin: string, frontendUrl: string): boolean {
  try {
    const request = new URL(normalizeOrigin(origin));
    const production = new URL(normalizeOrigin(frontendUrl));
    if (request.protocol !== "https:" || production.protocol !== "https:") return false;
    const prefix = vercelProjectPrefix(production.hostname.toLowerCase());
    const host = request.hostname.toLowerCase();
    if (!prefix) return false;
    return host.startsWith(`${prefix}-`) && host.endsWith(".vercel.app");
  } catch {
    return false;
  }
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
  for (const candidate of allowed) {
    if (isVercelPreviewOrigin(normalized, candidate)) return true;
  }
  return false;
}
