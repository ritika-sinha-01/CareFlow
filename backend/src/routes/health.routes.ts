import { Router } from "express";
import { healthController } from "../controllers/health.controller.js";

export const healthRouter = Router();

healthRouter.get("/", (req, res, next) => {
  void healthController(req, res).catch(next);
});
