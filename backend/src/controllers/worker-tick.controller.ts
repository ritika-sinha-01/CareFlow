import type { Request, Response } from "express";
import { env } from "../config/env.js";
import { runWorkerTick } from "../jobs/worker-tick.js";
import { apiError, apiSuccess } from "../utils/api-response.js";

function bearerToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (!header) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1];
}

export async function workerTickController(req: Request, res: Response): Promise<void> {
  if (!env.CRON_SECRET) {
    res.status(401).json(apiError("UNAUTHORIZED", "Worker tick is not configured."));
    return;
  }
  if (bearerToken(req) !== env.CRON_SECRET) {
    res.status(401).json(apiError("UNAUTHORIZED", "Please sign in to continue."));
    return;
  }

  await runWorkerTick();
  res.status(200).json(apiSuccess({ ran: true }));
}
