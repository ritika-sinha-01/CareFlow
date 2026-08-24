import type { AuthUser } from "../middleware/auth.js";
import { prisma } from "../db/prisma.js";
import { Errors } from "../utils/app-error.js";
import { requireDoctorRecord } from "./appointment-access.service.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";
import { nextMedicationFireAt } from "../utils/medication-frequency.js";
import { env } from "../config/env.js";
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

    const reminderRows = input.items.flatMap((item) => {
      const nextFireAt = nextMedicationFireAt(item.frequency, new Date(), env.CLINIC_TIMEZONE);
      if (!nextFireAt) return [];
      return [
        {
          appointmentId: appointment.id,
          patientId: appointment.patientId!,
          medicationName: item.name,
          scheduleLabel: [item.dosage, item.frequency, item.duration].filter(Boolean).join(" · "),
          nextFireAt,
          isActive: true,
        },
      ];
    });

    await tx.medicationReminder.deleteMany({
      where: {
        appointmentId: appointment.id,
        medicationName: { in: input.items.map((item) => item.name) },
      },
    });
    if (reminderRows.length > 0) {
      await tx.medicationReminder.createMany({ data: reminderRows });
    }
  });

  return serialized(appointment.id, "doctor");
}

export async function completeConsultation(user: AuthUser, appointmentId: string) {
  const doctor = await requireDoctorRecord(user.id);
  const appointmentIdCompleted = await prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM appointments WHERE id = ${appointmentId} FOR UPDATE
    `;
    if (locked.length === 0) throw Errors.appointmentNotFound();

    const appointment = await tx.appointment.findUnique({
      where: { id: appointmentId },
      include: appointmentInclude,
    });
    if (!appointment || appointment.doctorId !== doctor.id) {
      throw Errors.appointmentNotFound();
    }
    if (appointment.status !== "BOOKED") {
      throw Errors.invalidAppointmentState();
    }
    if (!appointment.clinicalNotes || appointment.clinicalNotes.trim().length < 12) {
      throw Errors.validation("Record clinical notes before sending a patient summary.");
    }

    assertTransition(appointment.status, "COMPLETED");
    const updated = await tx.appointment.updateMany({
      where: {
        id: appointment.id,
        status: "BOOKED",
        doctorId: doctor.id,
      },
      data: {
        status: "COMPLETED",
        occupancyKey: null,
        aiPostVisitStatus: "PENDING",
        aiPostVisitError: null,
      },
    });
    if (updated.count === 0) {
      throw Errors.invalidAppointmentState();
    }

    const alreadyFollowUp = (appointment.timeline ?? []).some((event) => event.code === "FOLLOW_UP");
    if (!alreadyFollowUp) {
      await tx.appointmentTimelineEvent.create({
        data: {
          appointmentId: appointment.id,
          code: "FOLLOW_UP",
          label: "Patient summary requested",
        },
      });
    }

    return appointment.id;
  });

  await prisma.job.create({
    data: {
      type: "GENERATE_POST_VISIT_AI",
      payload: { appointmentId: appointmentIdCompleted },
    },
  });

  return serialized(appointmentIdCompleted, "doctor");
}
