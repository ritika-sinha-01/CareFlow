import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { googleCalendarCallbackController } from "../controllers/integrations.controller.js";

export const integrationsRouter = Router();

integrationsRouter.get("/google/callback", asyncHandler(googleCalendarCallbackController));
