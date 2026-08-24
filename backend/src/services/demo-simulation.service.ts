import { env, isDemoSimulationEnabled, isProductionEnv } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const SIMULATION_FLAGS = [
  "AI",
  "EMAIL",
  "CALENDAR",
  "CALENDAR_DOCTOR",
  "CALENDAR_PATIENT",
  "BOOKING_CONFLICT",
  "LEAVE_CONFLICT",
  "HOLD_EXPIRED",
] as const;

export type SimulationFlag = (typeof SIMULATION_FLAGS)[number];

function isKnownFlag(flag: string): flag is SimulationFlag {
  return (SIMULATION_FLAGS as readonly string[]).includes(flag);
}

export function simulationGateOpen(): boolean {
  return isDemoSimulationEnabled(env);
}

export async function listSimulationFlags(): Promise<SimulationFlag[]> {
  if (!simulationGateOpen()) return [];
  const rows = await prisma.demoSimulationFlag.findMany({
    where: { enabled: true },
  });
  return rows.map((row) => row.flag).filter(isKnownFlag);
}

export async function setSimulationFlag(flag: SimulationFlag, enabled: boolean): Promise<SimulationFlag[]> {
  if (!simulationGateOpen() || isProductionEnv()) {
    await prisma.demoSimulationFlag.deleteMany();
    return [];
  }

  await prisma.demoSimulationFlag.upsert({
    where: { flag },
    create: { flag, enabled },
    update: { enabled },
  });
  return listSimulationFlags();
}

export async function shouldSimulate(flag: SimulationFlag): Promise<boolean> {
  if (!simulationGateOpen()) return false;
  const row = await prisma.demoSimulationFlag.findUnique({ where: { flag } });
  return row?.enabled === true;
}

export async function resetSimulationFlags(): Promise<void> {
  await prisma.demoSimulationFlag.deleteMany();
}
