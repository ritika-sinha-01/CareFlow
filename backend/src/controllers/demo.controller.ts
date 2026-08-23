import { z } from "zod";
import type { Request, Response } from "express";
import { Errors } from "../utils/app-error.js";
import { apiSuccess } from "../utils/api-response.js";
import {
  listSimulationFlags,
  setSimulationFlag,
  simulationGateOpen,
  type SimulationFlag,
} from "../services/demo-simulation.service.js";

const flagSchema = z.object({
  flag: z.enum(["AI", "EMAIL", "CALENDAR", "BOOKING_CONFLICT", "LEAVE_CONFLICT"]),
  enabled: z.boolean(),
});

export function getSimulationController(_req: Request, res: Response): void {
  if (!simulationGateOpen()) {
    throw Errors.simulationDisabled();
  }

  res.json(
    apiSuccess({
      enabled: true,
      activeFlags: listSimulationFlags(),
      availableFlags: ["AI", "EMAIL", "CALENDAR", "BOOKING_CONFLICT", "LEAVE_CONFLICT"],
    }),
  );
}

export function updateSimulationController(req: Request, res: Response): void {
  if (!simulationGateOpen()) {
    throw Errors.simulationDisabled();
  }

  const body = flagSchema.parse(req.body);
  const activeFlags = setSimulationFlag(body.flag as SimulationFlag, body.enabled);
  res.json(apiSuccess({ enabled: true, activeFlags }));
}
