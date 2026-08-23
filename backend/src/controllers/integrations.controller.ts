import type { Request, Response } from "express";
import { handleGoogleCallback } from "../services/calendar.service.js";

export async function googleCalendarCallbackController(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  const redirectTo = await handleGoogleCallback(code, state);
  res.redirect(redirectTo);
}
