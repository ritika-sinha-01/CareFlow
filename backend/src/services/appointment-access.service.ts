import { prisma } from "../db/prisma.js";
import type { AuthUser } from "../middleware/auth.js";
import { Errors } from "../utils/app-error.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";

export async function requireDoctorRecord(userId: string) {
  const doctor = await prisma.doctor.findUnique({ where: { userId } });
  if (!doctor) {
    throw Errors.forbidden();
  }
  return doctor;
}

export async function getVisibleAppointment(id: string, user: AuthUser) {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });

  if (!appointment) {
    throw Errors.notFound("This appointment is not available.");
  }

  if (user.role === "ADMIN") {
    return serializeAppointment(appointment, "admin");
  }

  if (user.role === "PATIENT" && appointment.patientId === user.id) {
    return serializeAppointment(appointment, "patient");
  }

  if (user.role === "DOCTOR") {
    const doctor = await requireDoctorRecord(user.id);
    if (appointment.doctorId === doctor.id) {
      return serializeAppointment(appointment, "doctor");
    }
  }

  throw Errors.notFound("This appointment is not available.");
}
