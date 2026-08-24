import type { AppointmentStatus } from "@prisma/client";
import { Errors } from "../utils/app-error.js";

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  HELD: ["BOOKED", "EXPIRED", "CANCELLED"],
  BOOKED: ["CANCELLED", "COMPLETED"],
  CANCELLED: [],
  EXPIRED: [],
  BLOCKED: ["CANCELLED"],
  COMPLETED: [],
};

export function canTransition(from: AppointmentStatus, to: AppointmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  if (!canTransition(from, to)) {
    throw Errors.invalidAppointmentState();
  }
}

export function isActiveOccupancy(status: AppointmentStatus): boolean {
  return status === "HELD" || status === "BOOKED" || status === "BLOCKED";
}
