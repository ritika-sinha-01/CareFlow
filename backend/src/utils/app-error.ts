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
  notCancellable: () =>
    new AppError(
      409,
      "NOT_CANCELLABLE",
      "This appointment can no longer be changed.",
    ),
  doctorUnavailable: () =>
    new AppError(
      409,
      "DOCTOR_UNAVAILABLE",
      "The clinician is not available at this time.",
    ),
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
};
