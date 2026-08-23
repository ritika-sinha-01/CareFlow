import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  appointmentByIdController,
  cancelAppointmentController,
  confirmHoldController,
  holdSlotController,
  patientAppointmentsController,
  patientDashboardController,
  patientDoctorController,
  patientDoctorsController,
  patientMedicationsController,
  patientSlotsController,
  releaseHoldController,
  rescheduleAppointmentController,
  updateProfileController,
} from "../controllers/portal.controller.js";

export const patientRouter = Router();

patientRouter.use(requireAuth, requireRole("PATIENT"));
patientRouter.get("/dashboard", asyncHandler(patientDashboardController));
patientRouter.get("/appointments", asyncHandler(patientAppointmentsController));
patientRouter.post("/holds", asyncHandler(holdSlotController));
patientRouter.post("/appointments/:id/confirm", asyncHandler(confirmHoldController));
patientRouter.post("/appointments/:id/release", asyncHandler(releaseHoldController));
patientRouter.post("/appointments/:id/cancel", asyncHandler(cancelAppointmentController));
patientRouter.post("/appointments/:id/reschedule", asyncHandler(rescheduleAppointmentController));
patientRouter.get("/appointments/:id", asyncHandler(appointmentByIdController));
patientRouter.get("/medications", asyncHandler(patientMedicationsController));
patientRouter.get("/doctors", asyncHandler(patientDoctorsController));
patientRouter.get("/doctors/:id/slots", asyncHandler(patientSlotsController));
patientRouter.get("/doctors/:id", asyncHandler(patientDoctorController));
patientRouter.patch("/profile", asyncHandler(updateProfileController));
