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

const optionalString = z
  .string()
  .optional()
  .transform((value) => {
    if (!value || value.trim() === "") return undefined;
    return value;
  });

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (value === true || value === "true" || value === "1") return true;
    return false;
  });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["development", "demo", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().default("http://localhost:5173"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),
  SLOT_HOLD_MINUTES: z.coerce.number().int().positive().default(5),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_HEARTBEAT_STALE_MS: z.coerce.number().int().positive().default(15000),
  EMAIL_PROVIDER: z.enum(["resend", "smtp"]).default("resend"),
  EMAIL_FROM: z.string().default("CareFlow <noreply@example.com>"),
  RESEND_API_KEY: optionalString,
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,
  SMTP_SECURE: booleanFromString,
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  GOOGLE_CLIENT_ID: optionalString,
  GOOGLE_CLIENT_SECRET: optionalString,
  GOOGLE_REDIRECT_URI: optionalString,
  ENABLE_DEMO_SIMULATION: booleanFromString,
});

export type Env = z.infer<typeof envSchema>;

function readEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.flatten().fieldErrors;
    throw new Error(`Invalid environment configuration: ${JSON.stringify(details)}`);
  }
  return parsed.data;
}

export const env = readEnv();

export function isProductionEnv(values: Pick<Env, "APP_ENV" | "NODE_ENV"> = env): boolean {
  return values.APP_ENV === "production" || values.NODE_ENV === "production";
}

export function isDemoSimulationEnabled(values: Env = env): boolean {
  if (isProductionEnv(values)) return false;
  return values.ENABLE_DEMO_SIMULATION === true;
}
