import { Router } from "express";
import { healthController, liveHealthController, readyHealthController } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/live", (req, res, next) => {
  try {
    liveHealthController(req, res);
  } catch (error) {
    next(error);
  }
});

healthRouter.get("/ready", (req, res, next) => {
  void readyHealthController(req, res).catch(next);
});

healthRouter.get("/", (req, res, next) => {
  void healthController(req, res).catch(next);
});
