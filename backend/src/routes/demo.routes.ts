import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getSimulationController,
  updateSimulationController,
} from "../controllers/demo.controller.js";
import { asyncHandler } from "../utils/async-handler.js";

export const demoRouter = Router();

demoRouter.use(requireAuth, requireRole("ADMIN"));
demoRouter.get("/simulation", asyncHandler(getSimulationController));
demoRouter.post("/simulation", asyncHandler(updateSimulationController));
