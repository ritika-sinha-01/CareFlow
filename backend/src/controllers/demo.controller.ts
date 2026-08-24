import { z } from "zod";
import type { Request, Response } from "express";
import { Errors } from "../utils/app-error.js";
import { apiSuccess } from "../utils/api-response.js";
import {
  listSimulationFlags,
  setSimulationFlag,
  simulationGateOpen,
  SIMULATION_FLAGS,
  type SimulationFlag,
} from "../services/demo-simulation.service.js";

const flagSchema = z.object({
  flag: z.enum(SIMULATION_FLAGS),
  enabled: z.boolean(),
});

export async function getSimulationController(_req: Request, res: Response): Promise<void> {
  if (!simulationGateOpen()) {
    throw Errors.simulationDisabled();
  }

  res.json(
    apiSuccess({
      enabled: true,
      activeFlags: await listSimulationFlags(),
      availableFlags: SIMULATION_FLAGS,
    }),
  );
}

export async function updateSimulationController(req: Request, res: Response): Promise<void> {
  if (!simulationGateOpen()) {
    throw Errors.simulationDisabled();
  }

  const body = flagSchema.parse(req.body);
  const activeFlags = await setSimulationFlag(body.flag as SimulationFlag, body.enabled);
  res.json(apiSuccess({ enabled: true, activeFlags }));
}
