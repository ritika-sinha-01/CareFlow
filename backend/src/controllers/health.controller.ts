import type { Request, Response } from "express";
import { getSystemHealth } from "../services/health.service.js";
import { apiSuccess } from "../utils/api-response.js";

export async function healthController(_req: Request, res: Response): Promise<void> {
  const health = await getSystemHealth();
  const statusCode = health.status === "UNAVAILABLE" ? 503 : 200;
  res.status(statusCode).json(apiSuccess(health));
}
