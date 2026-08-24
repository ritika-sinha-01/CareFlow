import { Router } from "express";
import { asyncHandler } from "../utils/async-handler.js";
import { patientDoctorsController } from "../controllers/portal.controller.js";

/** Public clinician directory. No auth. Response is public profile fields only. */
export const doctorsRouter = Router();

doctorsRouter.get("/", asyncHandler(patientDoctorsController));
