import type { AuthUser } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";
import { Errors } from "../utils/app-error.js";
import { requireDoctorRecord } from "./appointment-access.service.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";
import { clinicLocalToUtc, addCalendarDays, toClinicDateInput } from "../utils/clinic-time.js";
import { assertTransition } from "./appointment-state.js";

async function loadOwnedBooked(user: AuthUser, appointmentId: string) {
  const doctor = await requireDoctorRecord(user.id);
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });
  if (!appointment || appointment.doctorId !== doctor.id) {
    throw Errors.appointmentNotFound();
  }
  if (appointment.status !== "BOOKED") {
    throw Errors.invalidAppointmentState();
  }
  return appointment;
}

async function serialized(id: string, audience: "doctor") {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  if (!appointment) throw Errors.appointmentNotFound();
  return serializeAppointment(appointment, audience);
}

export async function saveClinicalNotes(user: AuthUser, appointmentId: string, clinicalNotes: string) {
  const appointment = await loadOwnedBooked(user, appointmentId);
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { clinicalNotes },
  });

  const alreadyNoted = (appointment.timeline ?? []).some((event) => event.code === "CONSULTATION");
  if (!alreadyNoted) {
    await prisma.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "CONSULTATION",
        label: "Consultation notes recorded",
      },
    });
  }

  return serialized(appointment.id, "doctor");
}

export async function issuePrescription(
  user: AuthUser,
  appointmentId: string,
  input: {
    items: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration?: string;
      instructions?: string;
    }>;
    notes?: string;
  },
) {
  const appointment = await loadOwnedBooked(user, appointmentId);
  if (!appointment.patientId || !appointment.patient) {
    throw Errors.conflict("A prescription needs an assigned patient.");
  }

  await prisma.$transaction(async (tx) => {
    const prescription = await tx.prescription.create({
      data: {
        appointmentId: appointment.id,
        items: input.items,
        notes: input.notes ?? null,
      },
    });

    await tx.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "PRESCRIPTION_ISSUED",
        label: "Prescription issued",
        metadata: { prescriptionId: prescription.id },
      },
    });

    const nextFireAt = nextMorning();
    await tx.medicationReminder.createMany({
      data: input.items.map((item) => ({
        appointmentId: appointment.id,
        patientId: appointment.patientId!,
        medicationName: item.name,
        scheduleLabel: [item.dosage, item.frequency, item.duration].filter(Boolean).join(" · "),
        nextFireAt,
      })),
    });
  });

  return serialized(appointment.id, "doctor");
}

export async function completeConsultation(user: AuthUser, appointmentId: string) {
  const appointment = await loadOwnedBooked(user, appointmentId);
  if (!appointment.clinicalNotes || appointment.clinicalNotes.trim().length < 12) {
    throw Errors.validation("Record clinical notes before sending a patient summary.");
  }

  assertTransition(appointment.status, "COMPLETED");
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: {
      status: "COMPLETED",
      aiPostVisitStatus: "PENDING",
      aiPostVisitError: null,
    },
  });

  const alreadyFollowUp = (appointment.timeline ?? []).some((event) => event.code === "FOLLOW_UP");
  if (!alreadyFollowUp) {
    await prisma.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "FOLLOW_UP",
        label: "Patient summary requested",
      },
    });
  }

  await prisma.job.create({
    data: {
      type: "GENERATE_POST_VISIT_AI",
      payload: { appointmentId: appointment.id },
    },
  });

  return serialized(appointment.id, "doctor");
}

function nextMorning(from = new Date()) {
  const tomorrow = addCalendarDays(toClinicDateInput(from), 1);
  return clinicLocalToUtc(tomorrow, "08:00");
}
