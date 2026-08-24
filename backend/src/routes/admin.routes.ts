import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  adminAppointmentsController,
  adminCreateDoctorController,
  adminUpdateDoctorController,
  adminDashboardController,
  adminDoctorController,
  adminDoctorsController,
  adminLeaveController,
  adminCreateLeaveController,
  adminResolveLeaveController,
  adminNotificationsController,
  appointmentByIdController,
  cancelAppointmentController,
} from "../controllers/portal.controller.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("ADMIN"));
adminRouter.get("/dashboard", asyncHandler(adminDashboardController));
adminRouter.get("/doctors", asyncHandler(adminDoctorsController));
adminRouter.post("/doctors", asyncHandler(adminCreateDoctorController));
adminRouter.patch("/doctors/:id", asyncHandler(adminUpdateDoctorController));
adminRouter.get("/doctors/:id", asyncHandler(adminDoctorController));
adminRouter.get("/appointments", asyncHandler(adminAppointmentsController));
adminRouter.get("/appointments/:id", asyncHandler(appointmentByIdController));
adminRouter.post("/appointments/:id/cancel", asyncHandler(cancelAppointmentController));
adminRouter.get("/leave", asyncHandler(adminLeaveController));
adminRouter.post("/leave", asyncHandler(adminCreateLeaveController));
adminRouter.post("/leave/:id/resolve", asyncHandler(adminResolveLeaveController));
adminRouter.get("/notifications", asyncHandler(adminNotificationsController));
