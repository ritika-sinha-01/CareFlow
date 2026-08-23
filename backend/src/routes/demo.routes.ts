import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  getSimulationController,
  updateSimulationController,
} from "../controllers/demo.controller.js";

export const demoRouter = Router();

demoRouter.use(requireAuth, requireRole("ADMIN"));
demoRouter.get("/simulation", getSimulationController);
demoRouter.post("/simulation", updateSimulationController);
