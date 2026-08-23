import { describe, expect, it, beforeEach } from "vitest";
import {
  listSimulationFlags,
  resetSimulationFlags,
  setSimulationFlag,
  shouldSimulate,
  simulationGateOpen,
} from "../src/services/demo-simulation.service.js";

describe("demo failure simulation", () => {
  beforeEach(() => {
    resetSimulationFlags();
  });

  it("is enabled in non-production when the env flag is on", () => {
    expect(simulationGateOpen()).toBe(true);
  });

  it("toggles flags in memory", () => {
    expect(shouldSimulate("AI")).toBe(false);
    setSimulationFlag("AI", true);
    expect(shouldSimulate("AI")).toBe(true);
    expect(listSimulationFlags()).toEqual(["AI"]);
    setSimulationFlag("AI", false);
    expect(shouldSimulate("AI")).toBe(false);
  });
});
