import { describe, expect, it } from "vitest";
import { isDemoSimulationEnabled, isProductionEnv, type Env } from "../src/config/env.js";

const base = {
  NODE_ENV: "development",
  APP_ENV: "development",
  ENABLE_DEMO_SIMULATION: true,
} as Env;

describe("simulation environment gate", () => {
  it("is disabled in production even if the flag is true", () => {
    expect(
      isDemoSimulationEnabled({
        ...base,
        NODE_ENV: "production",
        APP_ENV: "production",
        ENABLE_DEMO_SIMULATION: true,
      }),
    ).toBe(false);
    expect(isProductionEnv({ NODE_ENV: "production", APP_ENV: "demo" })).toBe(true);
  });

  it("requires the explicit demo flag", () => {
    expect(isDemoSimulationEnabled({ ...base, ENABLE_DEMO_SIMULATION: false })).toBe(false);
  });
});
