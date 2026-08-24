import type { Request, Response } from "express";
import { getLiveness, getReadiness, getSystemHealth } from "../services/health.service.js";
import { apiSuccess } from "../utils/api-response.js";

export async function healthController(_req: Request, res: Response): Promise<void> {
  const health = await getSystemHealth();
  const statusCode = health.status === "UNAVAILABLE" ? 503 : 200;
  res.status(statusCode).json(apiSuccess(health));
}

export function liveHealthController(_req: Request, res: Response): void {
  res.status(200).json(apiSuccess(getLiveness()));
}

export async function readyHealthController(_req: Request, res: Response): Promise<void> {
  const readiness = await getReadiness();
  res.status(readiness.ready ? 200 : 503).json(apiSuccess(readiness));
}
