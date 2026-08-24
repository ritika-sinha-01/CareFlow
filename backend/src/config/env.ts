import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const envFiles = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "backend/.env"),
  resolve(process.cwd(), "../.env"),
];

for (const file of envFiles) {
  if (existsSync(file)) {
    dotenv.config({ path: file, override: false });
  }
}

function isProductionProcessEnv(raw: NodeJS.ProcessEnv = process.env): boolean {
  return raw.APP_ENV === "production" || raw.NODE_ENV === "production";
}

if (!isProductionProcessEnv() && !process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    if (!value || value.trim() === "") return undefined;
    return value.trim();
  });

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === true || value === "true" || value === "1") return true;
    return false;
  });

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

const KNOWN_PLACEHOLDER_JWT_SECRETS = [
  "replace-with-a-long-random-string-at-least-32-chars",
  "test-secret-test-secret-test-secret-32",
];

export function isLocalhostOrigin(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const url = new URL(trimmed);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return /localhost|127\.0\.0\.1/i.test(trimmed);
  }
}

export function isUnsafeJwtSecret(secret: string): boolean {
  const normalized = secret.trim().toLowerCase();
  if (KNOWN_PLACEHOLDER_JWT_SECRETS.includes(normalized)) return true;
  if (/replace-with-a-|change-?me|your[-_]?jwt[-_]?secret|example[-_]?secret|jwt[-_]?secret[-_]?here/.test(normalized)) {
    return true;
  }
  if (secret.length > 0 && /^(.)\1+$/.test(secret)) return true;
  return false;
}

function looksPooledDatabaseUrl(url: string): boolean {
  return /pooler|pgbouncer/i.test(url);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "demo", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: optionalString,
  CORS_ORIGIN: optionalString,
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DIRECT_URL: optionalString,
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  SLOT_HOLD_MINUTES: z.coerce.number().int().positive().default(5),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_HEARTBEAT_STALE_MS: z.coerce.number().int().positive().default(15000),
  CLINIC_TIMEZONE: z.string().default("Asia/Kolkata"),
  APPOINTMENT_REMINDER_HOURS: z.coerce.number().int().positive().default(24),
  EMAIL_PROVIDER: z.enum(["resend", "smtp", "test"]).default("resend"),
  EMAIL_FROM: z.string().default("CareFlow <noreply@example.com>"),
  RESEND_API_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_SECURE: booleanFromString,
  AI_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  CALENDAR_PROVIDER: z.enum(["google", "mock"]).default("google"),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString,
  DEMO_MODE: booleanFromString,
  ENABLE_DEMO_SIMULATION: booleanFromString,
  CRON_SECRET: optionalString,
});

type ParsedEnv = z.infer<typeof envSchema>;

export type Env = Omit<ParsedEnv, "FRONTEND_URL" | "CORS_ORIGIN" | "DIRECT_URL"> & {
  FRONTEND_URL: string;
  CORS_ORIGIN: string;
  DIRECT_URL: string;
};

function productionSafetyErrors(parsed: ParsedEnv): string[] {
  if (!(parsed.APP_ENV === "production" || parsed.NODE_ENV === "production")) {
    return [];
  }

  const errors: string[] = [];
  if (!parsed.FRONTEND_URL) {
    errors.push("FRONTEND_URL must be set explicitly in production. Localhost defaults are not used.");
  } else if (isLocalhostOrigin(parsed.FRONTEND_URL)) {
    errors.push("FRONTEND_URL must not use localhost in production.");
  }

  if (!parsed.CORS_ORIGIN) {
    errors.push("CORS_ORIGIN must be set explicitly in production. Localhost defaults are not used.");
  } else {
    const origins = parsed.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean);
    if (origins.some(isLocalhostOrigin)) {
      errors.push("CORS_ORIGIN must not include localhost in production.");
    }
  }

  if (isUnsafeJwtSecret(parsed.JWT_SECRET)) {
    errors.push(
      "JWT_SECRET is a known placeholder or example value. Set a unique secret of at least 32 characters.",
    );
  }

  if (parsed.DEMO_MODE === true) {
    errors.push("DEMO_MODE must be false in production.");
  }
  if (parsed.ENABLE_DEMO_SIMULATION === true) {
    errors.push("ENABLE_DEMO_SIMULATION must be false in production.");
  }

  if (!parsed.DIRECT_URL) {
    errors.push(
      "DIRECT_URL must be set in production. Use the Neon direct (non-pooled) connection. Do not reuse the pooled DATABASE_URL.",
    );
  } else if (looksPooledDatabaseUrl(parsed.DIRECT_URL)) {
    errors.push("DIRECT_URL must be the Neon direct connection, not a pooled/pgbouncer URL.");
  }

  if (parsed.GOOGLE_REDIRECT_URI && isLocalhostOrigin(parsed.GOOGLE_REDIRECT_URI)) {
    errors.push("GOOGLE_REDIRECT_URI must not use localhost in production.");
  }
  if ((parsed.GOOGLE_CLIENT_ID || parsed.GOOGLE_CLIENT_SECRET) && !parsed.GOOGLE_REDIRECT_URI) {
    errors.push("GOOGLE_REDIRECT_URI must be set when Google Calendar OAuth is configured.");
  }

  return errors;
}

export function readEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    const messages = Object.entries(details).map(([field, issues]) => `${field}: ${(issues ?? []).join(", ")}`);
    throw new Error(`Invalid environment configuration: ${messages.join("; ")}`);
  }

  const safetyErrors = productionSafetyErrors(parsed.data);
  if (safetyErrors.length > 0) {
    throw new Error(`Invalid production environment:\n- ${safetyErrors.join("\n- ")}`);
  }

  if (!isValidTimeZone(parsed.data.CLINIC_TIMEZONE)) {
    throw new Error(`Invalid CLINIC_TIMEZONE: ${parsed.data.CLINIC_TIMEZONE}`);
  }

  const frontendUrl = parsed.data.FRONTEND_URL ?? "http://localhost:5173";
  const corsOrigin = parsed.data.CORS_ORIGIN ?? frontendUrl;
  const production = isProductionProcessEnv(raw);
  const directUrl = parsed.data.DIRECT_URL ?? (production ? undefined : parsed.data.DATABASE_URL);
  if (!directUrl) {
    throw new Error(
      "DIRECT_URL must be set in production. Use the Neon direct (non-pooled) connection. Do not reuse the pooled DATABASE_URL.",
    );
  }

  if (!production && !raw.DIRECT_URL?.trim() && !process.env.DIRECT_URL?.trim()) {
    process.env.DIRECT_URL = directUrl;
  }

  return {
    ...parsed.data,
    FRONTEND_URL: frontendUrl,
    CORS_ORIGIN: corsOrigin,
    DIRECT_URL: directUrl,
  };
}

export const env = readEnv();

export function isProductionEnv(values: Pick<Env, "APP_ENV" | "NODE_ENV"> = env): boolean {
  return values.APP_ENV === "production" || values.NODE_ENV === "production";
}

export function isDemoSimulationEnabled(
  values: Pick<Env, "APP_ENV" | "NODE_ENV" | "DEMO_MODE" | "ENABLE_DEMO_SIMULATION"> = env,
): boolean {
  if (isProductionEnv(values)) return false;
  return values.DEMO_MODE === true || values.ENABLE_DEMO_SIMULATION === true;
}

export function assertDemoSeedAllowed(
  values: { NODE_ENV?: string; APP_ENV?: string } = process.env,
): void {
  if (values.APP_ENV === "production" || values.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed demo data in production. The seed script creates known demo users and is only for local or demo environments.",
    );
  }
}

export { isValidTimeZone };
