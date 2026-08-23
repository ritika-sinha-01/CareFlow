import { env, isDemoSimulationEnabled, isProductionEnv } from "../config/env.js";

export type SimulationFlag =
  | "AI"
  | "EMAIL"
  | "CALENDAR"
  | "BOOKING_CONFLICT"
  | "LEAVE_CONFLICT";

const flags = new Set<SimulationFlag>();

export function simulationGateOpen(): boolean {
  return isDemoSimulationEnabled(env);
}

export function listSimulationFlags(): SimulationFlag[] {
  return [...flags];
}

export function setSimulationFlag(flag: SimulationFlag, enabled: boolean): SimulationFlag[] {
  if (!simulationGateOpen() || isProductionEnv()) {
    flags.clear();
    return [];
  }

  if (enabled) flags.add(flag);
  else flags.delete(flag);
  return listSimulationFlags();
}

export function shouldSimulate(flag: SimulationFlag): boolean {
  if (!simulationGateOpen()) return false;
  return flags.has(flag);
}

export function resetSimulationFlags(): void {
  flags.clear();
}
