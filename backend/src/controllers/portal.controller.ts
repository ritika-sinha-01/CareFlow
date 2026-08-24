import type { Request, Response } from "express";
import {
  createDoctorSchema,
  loginSchema,
  profileSchema,
  registerSchema,
} from "../validators/auth.validators.js";
import * as authService from "../services/auth.service.js";
import * as patientService from "../services/patient.service.js";
import * as doctorService from "../services/doctor.service.js";
import * as adminService from "../services/admin.service.js";
import { getVisibleAppointment, requireDoctorRecord } from "../services/appointment-access.service.js";
import * as appointmentService from "../services/appointment.service.js";
import * as slotService from "../services/slot.service.js";
import { confirmSchema, consultationNotesSchema, holdSchema, leaveSchema, calendarConnectSchema, prescriptionSchema, rescheduleSchema, slotsQuerySchema } from "../validators/appointment.validators.js";
import { apiSuccess } from "../utils/api-response.js";
import { Errors } from "../utils/app-error.js";
import * as leaveService from "../services/leave.service.js";
import * as calendarService from "../services/calendar.service.js";
import * as aiService from "../services/ai.service.js";
import * as consultationService from "../services/consultation.service.js";

function routeParam(value: string | string[] | undefined): string {
  const id = Array.isArray(value) ? value[0] : value;
  if (!id) throw Errors.notFound();
  return id;
}

export async function registerController(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body);
  const session = await authService.registerPatient(input);
  res.status(201).json(apiSuccess(session));
}

export async function loginController(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body);
  const session = await authService.login(input);
  res.json(apiSuccess(session));
}

export async function meController(req: Request, res: Response): Promise<void> {
  const session = await authService.getSession(req.user!);
  res.json(apiSuccess(session));
}

export async function updateProfileController(req: Request, res: Response): Promise<void> {
  const input = profileSchema.parse(req.body);
  const session = await authService.updateProfile(req.user!, input);
  res.json(apiSuccess(session));
}

export async function patientDashboardController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await patientService.getPatientDashboard(req.user!)));
}

export async function patientAppointmentsController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await patientService.listPatientAppointments(req.user!)));
}

export async function appointmentByIdController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await getVisibleAppointment(routeParam(req.params.id), req.user!)));
}

export async function patientMedicationsController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await patientService.listPatientMedications(req.user!)));
}

export async function patientDoctorsController(req: Request, res: Response): Promise<void> {
  const specialization = typeof req.query.specialization === "string" ? req.query.specialization : undefined;
  res.json(apiSuccess(await patientService.listDoctorsForPatients(specialization)));
}

export async function patientDoctorController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await patientService.getDoctorForPatient(routeParam(req.params.id))));
}

export async function doctorDashboardController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await doctorService.getDoctorDashboard(req.user!)));
}

export async function doctorAppointmentsController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await doctorService.listDoctorAppointments(req.user!)));
}

export async function doctorPatientsController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await doctorService.listDoctorPatients(req.user!)));
}

export async function doctorProfileController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await doctorService.getDoctorProfile(req.user!)));
}

export async function adminDashboardController(_req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await adminService.getAdminDashboard()));
}

export async function adminDoctorsController(_req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await adminService.listAdminDoctors()));
}

export async function adminDoctorController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await adminService.getAdminDoctor(routeParam(req.params.id))));
}

export async function adminCreateDoctorController(req: Request, res: Response): Promise<void> {
  const input = createDoctorSchema.parse(req.body);
  res.status(201).json(apiSuccess(await adminService.createDoctor(input)));
}

export async function adminAppointmentsController(_req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await adminService.listAdminAppointments()));
}

export async function adminLeaveController(_req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await leaveService.listLeaveWithConflicts()));
}

export async function adminCreateLeaveController(req: Request, res: Response): Promise<void> {
  const input = leaveSchema.parse(req.body);
  res.status(201).json(
    apiSuccess(
      await leaveService.createDoctorLeave({
        ...input,
        actorUserId: req.user!.id,
      }),
    ),
  );
}

export async function adminResolveLeaveController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await leaveService.resolveLeaveConflicts(routeParam(req.params.id), req.user!.id)));
}

export async function adminNotificationsController(_req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await adminService.listAdminNotifications()));
}

export async function patientSlotsController(req: Request, res: Response): Promise<void> {
  const { date } = slotsQuerySchema.parse(req.query);
  res.json(
    apiSuccess(await slotService.listSlotsForDoctor(routeParam(req.params.id), date, req.user!.id)),
  );
}

export async function holdSlotController(req: Request, res: Response): Promise<void> {
  const input = holdSchema.parse(req.body);
  res.status(201).json(apiSuccess(await appointmentService.holdSlot(req.user!, input.doctorId, input.startAt)));
}

export async function confirmHoldController(req: Request, res: Response): Promise<void> {
  const input = confirmSchema.parse(req.body);
  res.json(apiSuccess(await appointmentService.confirmHold(req.user!, routeParam(req.params.id), input.symptoms)));
}

export async function releaseHoldController(req: Request, res: Response): Promise<void> {
  await appointmentService.releaseHold(req.user!, routeParam(req.params.id));
  res.json(apiSuccess({ released: true }));
}

export async function cancelAppointmentController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await appointmentService.cancelAppointment(req.user!, routeParam(req.params.id))));
}

export async function rescheduleAppointmentController(req: Request, res: Response): Promise<void> {
  const input = rescheduleSchema.parse(req.body);
  res.json(
    apiSuccess(await appointmentService.rescheduleAppointment(req.user!, routeParam(req.params.id), input.startAt)),
  );
}

export async function doctorCalendarConnectController(req: Request, res: Response): Promise<void> {
  await requireDoctorRecord(req.user!.id);
  const input = calendarConnectSchema.parse(req.body ?? {});
  res.json(apiSuccess(calendarService.getGoogleConnectUrl(req.user!.id, "DOCTOR", input.returnTo)));
}

export async function doctorCalendarDisconnectController(req: Request, res: Response): Promise<void> {
  await requireDoctorRecord(req.user!.id);
  await calendarService.disconnectGoogleCalendar(req.user!.id);
  res.json(apiSuccess({ connected: false, calendarConnected: false, status: "NOT_CONNECTED" }));
}

export async function doctorCalendarStatusController(req: Request, res: Response): Promise<void> {
  await requireDoctorRecord(req.user!.id);
  res.json(apiSuccess(await calendarService.getCalendarStatusForUser(req.user!.id)));
}

export async function patientCalendarConnectController(req: Request, res: Response): Promise<void> {
  const input = calendarConnectSchema.parse(req.body ?? {});
  res.json(apiSuccess(calendarService.getGoogleConnectUrl(req.user!.id, "PATIENT", input.returnTo)));
}

export async function patientCalendarDisconnectController(req: Request, res: Response): Promise<void> {
  await calendarService.disconnectGoogleCalendar(req.user!.id);
  res.json(apiSuccess({ connected: false, calendarConnected: false, status: "NOT_CONNECTED" }));
}

export async function patientCalendarStatusController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await calendarService.getCalendarStatusForUser(req.user!.id)));
}

export async function doctorRetryAiController(req: Request, res: Response): Promise<void> {
  const appointment = await getVisibleAppointment(routeParam(req.params.id), req.user!);
  await aiService.queuePreVisitRetry(appointment.id);
  res.json(apiSuccess(await getVisibleAppointment(appointment.id, req.user!)));
}

export async function doctorSaveNotesController(req: Request, res: Response): Promise<void> {
  const input = consultationNotesSchema.parse(req.body);
  res.json(apiSuccess(await consultationService.saveClinicalNotes(req.user!, routeParam(req.params.id), input.clinicalNotes)));
}

export async function doctorIssuePrescriptionController(req: Request, res: Response): Promise<void> {
  const input = prescriptionSchema.parse(req.body);
  res.status(201).json(apiSuccess(await consultationService.issuePrescription(req.user!, routeParam(req.params.id), input)));
}

export async function doctorCompleteVisitController(req: Request, res: Response): Promise<void> {
  res.json(apiSuccess(await consultationService.completeConsultation(req.user!, routeParam(req.params.id))));
}
