export const PRODUCTION_APP_URL = "https://care-flow-frontend-eta.vercel.app";
export const PRODUCTION_API_URL = "https://careflow-backend-six.vercel.app";

export function isVercelPreviewHost(hostname: string, productionAppUrl = PRODUCTION_APP_URL): boolean {
  if (!hostname.endsWith(".vercel.app")) return false;
  try {
    return hostname !== new URL(productionAppUrl).hostname;
  } catch {
    return true;
  }
}
