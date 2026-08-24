import { Router } from "express";
import { workerTickController } from "../controllers/worker-tick.controller.js";

export const internalRouter = Router();

internalRouter.get("/worker/tick", (req, res, next) => {
  void workerTickController(req, res).catch(next);
});
