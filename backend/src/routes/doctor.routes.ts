import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  appointmentByIdController,
  doctorAppointmentsController,
  doctorDashboardController,
  doctorPatientsController,
  doctorProfileController,
  doctorCalendarConnectController,
  doctorCalendarDisconnectController,
  doctorCalendarStatusController,
  doctorRetryAiController,
  doctorSaveNotesController,
  doctorIssuePrescriptionController,
  doctorCompleteVisitController,
  cancelAppointmentController,
  doctorLeaveController,
  doctorCreateLeaveController,
  doctorResolveLeaveController,
} from "../controllers/portal.controller.js";
import { googleCalendarCallbackController } from "../controllers/integrations.controller.js";

export const doctorRouter = Router();

doctorRouter.get("/calendar/callback", asyncHandler(googleCalendarCallbackController));
doctorRouter.use(requireAuth, requireRole("DOCTOR"));
doctorRouter.get("/dashboard", asyncHandler(doctorDashboardController));
doctorRouter.get("/appointments", asyncHandler(doctorAppointmentsController));
doctorRouter.get("/appointments/:id", asyncHandler(appointmentByIdController));
doctorRouter.post("/appointments/:id/ai/retry", asyncHandler(doctorRetryAiController));
doctorRouter.patch("/appointments/:id/notes", asyncHandler(doctorSaveNotesController));
doctorRouter.post("/appointments/:id/prescriptions", asyncHandler(doctorIssuePrescriptionController));
doctorRouter.post("/appointments/:id/complete", asyncHandler(doctorCompleteVisitController));
doctorRouter.post("/appointments/:id/cancel", asyncHandler(cancelAppointmentController));
doctorRouter.get("/patients", asyncHandler(doctorPatientsController));
doctorRouter.get("/profile", asyncHandler(doctorProfileController));
doctorRouter.get("/leave", asyncHandler(doctorLeaveController));
doctorRouter.post("/leave", asyncHandler(doctorCreateLeaveController));
doctorRouter.post("/leave/:id/resolve", asyncHandler(doctorResolveLeaveController));
doctorRouter.post("/calendar/connect", asyncHandler(doctorCalendarConnectController));
doctorRouter.post("/calendar/disconnect", asyncHandler(doctorCalendarDisconnectController));
doctorRouter.get("/calendar/status", asyncHandler(doctorCalendarStatusController));
