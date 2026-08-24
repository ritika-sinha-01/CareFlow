import { describe, expect, it } from "vitest";
import {
  assertDemoSeedAllowed,
  isDemoSimulationEnabled,
  isProductionEnv,
  isUnsafeJwtSecret,
  readEnv,
} from "../src/config/env.js";

const base = {
  NODE_ENV: "development" as const,
  APP_ENV: "development" as const,
  ENABLE_DEMO_SIMULATION: true,
  DEMO_MODE: false,
};

const localDatabase = "postgresql://careflow:careflow@127.0.0.1:54329/careflow?schema=public";
const productionSecret = "prod-jwt-secret-not-a-placeholder-value-48";

function productionRaw(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "production",
    APP_ENV: "production",
    DATABASE_URL: "postgresql://careflow:careflow@ep-example.us-east-1.aws.neon.tech/careflow",
    DIRECT_URL: "postgresql://careflow:careflow@ep-example.us-east-1.aws.neon.tech/careflow",
    JWT_SECRET: productionSecret,
    FRONTEND_URL: "https://careflow.example.com",
    CORS_ORIGIN: "https://careflow.example.com",
    DEMO_MODE: "false",
    ENABLE_DEMO_SIMULATION: "false",
    ...overrides,
  };
}

describe("simulation environment gate", () => {
  it("is disabled in production even if the flag is true", () => {
    expect(
      isDemoSimulationEnabled({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        ENABLE_DEMO_SIMULATION: true,
        DEMO_MODE: true,
      }),
    ).toBe(false);
    expect(isProductionEnv({ NODE_ENV: "production", APP_ENV: "demo" })).toBe(true);
  });

  it("requires DEMO_MODE or ENABLE_DEMO_SIMULATION", () => {
    expect(isDemoSimulationEnabled({ ...base, ENABLE_DEMO_SIMULATION: false, DEMO_MODE: false })).toBe(false);
    expect(isDemoSimulationEnabled({ ...base, ENABLE_DEMO_SIMULATION: false, DEMO_MODE: true })).toBe(true);
    expect(isDemoSimulationEnabled({ ...base, ENABLE_DEMO_SIMULATION: true, DEMO_MODE: false })).toBe(true);
  });
});

describe("production environment validation", () => {
  it("keeps localhost defaults in development", () => {
    const parsed = readEnv({
      NODE_ENV: "development",
      APP_ENV: "development",
      DATABASE_URL: localDatabase,
      JWT_SECRET: "dev-secret-dev-secret-dev-secret-32ch",
    });
    expect(parsed.FRONTEND_URL).toBe("http://localhost:5173");
    expect(parsed.CORS_ORIGIN).toBe("http://localhost:5173");
    expect(parsed.DIRECT_URL).toBe(localDatabase);
  });

  it("accepts an explicit production configuration", () => {
    const parsed = readEnv(productionRaw());
    expect(parsed.FRONTEND_URL).toBe("https://careflow.example.com");
    expect(parsed.CORS_ORIGIN).toBe("https://careflow.example.com");
    expect(parsed.DEMO_MODE).toBe(false);
  });

  it("rejects missing FRONTEND_URL and CORS_ORIGIN in production", () => {
    expect(() =>
      readEnv(
        productionRaw({
          FRONTEND_URL: "",
          CORS_ORIGIN: "",
        }),
      ),
    ).toThrow(/FRONTEND_URL must be set explicitly in production/);
  });

  it("rejects localhost FRONTEND_URL, CORS_ORIGIN, and Google redirect in production", () => {
    expect(() =>
      readEnv(
        productionRaw({
          FRONTEND_URL: "http://localhost:5173",
        }),
      ),
    ).toThrow(/FRONTEND_URL must not use localhost/);

    expect(() =>
      readEnv(
        productionRaw({
          CORS_ORIGIN: "http://localhost:5173",
        }),
      ),
    ).toThrow(/CORS_ORIGIN must not include localhost/);

    expect(() =>
      readEnv(
        productionRaw({
          GOOGLE_REDIRECT_URI: "http://localhost:4000/api/integrations/google/callback",
        }),
      ),
    ).toThrow(/GOOGLE_REDIRECT_URI must not use localhost/);
  });

  it("rejects known placeholder JWT secrets without printing the secret", () => {
    expect(isUnsafeJwtSecret("replace-with-a-long-random-string-at-least-32-chars")).toBe(true);
    try {
      readEnv(
        productionRaw({
          JWT_SECRET: "replace-with-a-long-random-string-at-least-32-chars",
        }),
      );
      throw new Error("expected production JWT validation to fail");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toMatch(/JWT_SECRET is a known placeholder/);
      expect(message).not.toMatch(/replace-with-a-long-random-string-at-least-32-chars/);
    }
  });

  it("rejects demo mode in production", () => {
    expect(() => readEnv(productionRaw({ DEMO_MODE: "true" }))).toThrow(/DEMO_MODE must be false/);
    expect(() => readEnv(productionRaw({ ENABLE_DEMO_SIMULATION: "true" }))).toThrow(
      /ENABLE_DEMO_SIMULATION must be false/,
    );
  });

  it("requires DIRECT_URL in production and does not fall back to DATABASE_URL", () => {
    expect(() =>
      readEnv(
        productionRaw({
          DATABASE_URL: "postgresql://careflow:careflow@ep-example.us-east-1.aws.neon.tech/careflow",
          DIRECT_URL: "",
        }),
      ),
    ).toThrow(/DIRECT_URL must be set in production/);

    expect(() =>
      readEnv(
        productionRaw({
          DATABASE_URL: "postgresql://careflow:careflow@ep-example-pooler.us-east-1.aws.neon.tech/careflow",
          DIRECT_URL: "",
        }),
      ),
    ).toThrow(/DIRECT_URL must be set in production/);
  });

  it("rejects a pooled DIRECT_URL in production", () => {
    expect(() =>
      readEnv(
        productionRaw({
          DIRECT_URL: "postgresql://careflow:careflow@ep-example-pooler.us-east-1.aws.neon.tech/careflow",
        }),
      ),
    ).toThrow(/DIRECT_URL must be the Neon direct connection/);
  });
});

describe("demo seed guard", () => {
  it("refuses to seed when production is detected", () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "production", APP_ENV: "development" })).toThrow(
      /Refusing to seed demo data in production/,
    );
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "development", APP_ENV: "production" })).toThrow(
      /Refusing to seed demo data in production/,
    );
  });

  it("allows seed in development", () => {
    expect(() => assertDemoSeedAllowed({ NODE_ENV: "development", APP_ENV: "development" })).not.toThrow();
  });
});
