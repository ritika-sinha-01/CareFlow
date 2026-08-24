import { describe, expect, it } from "vitest";
import { isDemoSimulationEnabled, isProductionEnv } from "../src/config/env.js";

const base = {
  NODE_ENV: "development" as const,
  APP_ENV: "development" as const,
  ENABLE_DEMO_SIMULATION: true,
  DEMO_MODE: false,
};

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
