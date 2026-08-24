import { describe, expect, it, beforeEach, afterAll } from "vitest";
import {
  listSimulationFlags,
  resetSimulationFlags,
  setSimulationFlag,
  shouldSimulate,
  simulationGateOpen,
} from "../src/services/demo-simulation.service.js";
import { prisma } from "../src/db/prisma.js";

describe("demo failure simulation", () => {
  beforeEach(async () => {
    await resetSimulationFlags();
  });

  afterAll(async () => {
    await resetSimulationFlags();
    await prisma.$disconnect();
  });

  it("is enabled in non-production when DEMO_MODE is on", () => {
    expect(simulationGateOpen()).toBe(true);
  });

  it("persists flags in postgres so another process can read them", async () => {
    expect(await shouldSimulate("AI")).toBe(false);
    await setSimulationFlag("AI", true);
    expect(await shouldSimulate("AI")).toBe(true);
    expect(await listSimulationFlags()).toEqual(["AI"]);

    const row = await prisma.demoSimulationFlag.findUniqueOrThrow({ where: { flag: "AI" } });
    expect(row.enabled).toBe(true);

    await setSimulationFlag("AI", false);
    expect(await shouldSimulate("AI")).toBe(false);
  });
});
