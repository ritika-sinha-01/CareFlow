export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const Errors = {
  unauthorized: () =>
    new AppError(401, "UNAUTHORIZED", "Please sign in to continue."),
  forbidden: () =>
    new AppError(403, "FORBIDDEN", "You do not have access to this resource."),
  notFound: (message = "The requested resource was not found.") =>
    new AppError(404, "NOT_FOUND", message),
  appointmentNotFound: () =>
    new AppError(404, "APPOINTMENT_NOT_FOUND", "This appointment is not available."),
  slotUnavailable: () =>
    new AppError(
      409,
      "SLOT_UNAVAILABLE",
      "This appointment slot is no longer available.",
    ),
  holdExpired: () =>
    new AppError(
      409,
      "HOLD_EXPIRED",
      "Your reservation expired. Please choose a time again.",
    ),
  holdNotOwned: () =>
    new AppError(409, "HOLD_NOT_OWNED", "This reservation belongs to another patient."),
  invalidAppointmentState: () =>
    new AppError(
      409,
      "INVALID_APPOINTMENT_STATE",
      "This appointment cannot move to that state.",
    ),
  unauthorizedAppointmentAction: () =>
    new AppError(403, "UNAUTHORIZED_APPOINTMENT_ACTION", "You cannot change this appointment."),
  notCancellable: () =>
    new AppError(
      409,
      "INVALID_APPOINTMENT_STATE",
      "This appointment can no longer be changed.",
    ),
  doctorUnavailable: () =>
    new AppError(
      409,
      "DOCTOR_UNAVAILABLE",
      "The clinician is not available at this time.",
    ),
  doctorOnLeave: () =>
    new AppError(409, "DOCTOR_ON_LEAVE", "The clinician is on leave on this date."),
  simulationDisabled: () =>
    new AppError(
      403,
      "SIMULATION_DISABLED",
      "Failure simulation is disabled in this environment.",
    ),
  validation: (message: string, details?: unknown) =>
    new AppError(400, "VALIDATION_ERROR", message, details),
  conflict: (message: string) => new AppError(409, "CONFLICT", message),
  invalidCredentials: () =>
    new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect."),
  tooManyRequests: () =>
    new AppError(429, "RATE_LIMITED", "Too many attempts. Please wait and try again."),
};
