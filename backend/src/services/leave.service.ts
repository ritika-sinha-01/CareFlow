import { prisma } from "../db/prisma.js";
import { Errors } from "../utils/app-error.js";
import { addCalendarDays, clinicLocalToUtc, isoDate } from "../utils/clinic-time.js";
import { displayName } from "../utils/serializers.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";
import { shouldSimulate } from "./demo-simulation.service.js";
import { recordSystemEvent } from "./system-event.service.js";
import { cancelAppointmentReminders } from "./appointment-reminder.service.js";
import { queueUserNotification } from "./notification.service.js";
import { ensureCalendarParticipants } from "./calendar.service.js";

function leaveWindow(startDate: Date, endDate: Date) {
  const start = clinicLocalToUtc(isoDate(startDate), "00:00");
  const end = clinicLocalToUtc(addCalendarDays(isoDate(endDate), 1), "00:00");
  return { start, end };
}

function asUtcDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

async function affectedAppointments(doctorId: string, startDate: Date, endDate: Date) {
  const { start, end } = leaveWindow(startDate, endDate);
  return prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: ["BOOKED", "HELD"] },
      startAt: { gte: start, lt: end },
    },
    include: appointmentInclude,
    orderBy: { startAt: "asc" },
  });
}

export async function createDoctorLeave(input: {
  doctorId: string;
  startDate: string;
  endDate: string;
  reason?: string;
  actorUserId: string;
}) {
  if (input.endDate < input.startDate) {
    throw Errors.validation("Leave cannot end before it starts.");
  }

  const doctor = await prisma.doctor.findUnique({
    where: { id: input.doctorId },
    include: { user: true },
  });
  if (!doctor) throw Errors.notFound("This doctor profile is not available.");

  const startDate = asUtcDate(input.startDate);
  const endDate = asUtcDate(input.endDate);

  const leave = await prisma.doctorLeave.create({
    data: {
      doctorId: doctor.id,
      startDate,
      endDate,
      reason: input.reason?.trim() || null,
    },
  });

  await recordSystemEvent({
    type: "DOCTOR_LEAVE_CREATED",
    message: `Leave recorded for ${displayName(doctor.user)}.`,
    actorUserId: input.actorUserId,
    entityType: "doctor",
    entityId: doctor.id,
  });

  const affected = await affectedAppointments(doctor.id, startDate, endDate);
  return serializeLeave(leave.id, doctor.id, displayName(doctor.user), startDate, endDate, input.reason ?? null, affected);
}

export async function resolveLeaveConflicts(leaveId: string, actorUserId: string, ownedDoctorId?: string) {
  if (await shouldSimulate("LEAVE_CONFLICT")) {
    throw Errors.conflict("Leave conflict resolution is simulated as failing. Appointments were not changed.");
  }

  const leave = await prisma.doctorLeave.findUnique({
    where: { id: leaveId },
    include: { doctor: { include: { user: true } } },
  });
  if (!leave) throw Errors.notFound("This leave record is not available.");
  if (ownedDoctorId && leave.doctorId !== ownedDoctorId) {
    throw Errors.notFound("This leave record is not available.");
  }

  const affected = await affectedAppointments(leave.doctorId, leave.startDate, leave.endDate);
  const now = new Date();

  for (const appointment of affected) {
    await prisma.$transaction(async (tx) => {
      await tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: "CANCELLED",
          occupancyKey: null,
          cancelReason: "LEAVE",
          cancelledAt: now,
        },
      });
      await tx.appointmentTimelineEvent.create({
        data: {
          appointmentId: appointment.id,
          code: "APPOINTMENT_CANCELLED",
          label: "Cancelled because the clinician is on leave",
        },
      });
    });

    await recordSystemEvent({
      type: "APPOINTMENT_CANCELLED",
      message: "Appointment cancelled due to clinician leave.",
      actorUserId,
      entityType: "appointment",
      entityId: appointment.id,
    });

    await cancelAppointmentReminders(appointment.id).catch(() => undefined);

    if (appointment.patient) {
      await queueUserNotification({
        userId: appointment.patient.id,
        email: appointment.patient.email,
        appointmentId: appointment.id,
        type: "LEAVE_AFFECTED",
        subject: "Your CareFlow appointment needs to be rescheduled",
        body: "Your clinician is unavailable on this date. The visit was released so you can book another time.",
      }).catch(() => undefined);
    }
    await queueUserNotification({
      userId: appointment.doctor.user.id,
      email: appointment.doctor.user.email,
      appointmentId: appointment.id,
      type: "LEAVE_AFFECTED",
      subject: "A CareFlow appointment was released due to leave",
      body: "A visit was released because this clinician is on leave.",
    }).catch(() => undefined);

    await ensureCalendarParticipants(appointment.id).catch(() => undefined);
    await prisma.job.create({
      data: {
        type: "CALENDAR_SYNC",
        payload: { appointmentId: appointment.id, action: "delete" },
      },
    }).catch(() => undefined);
  }

  const remaining = await affectedAppointments(leave.doctorId, leave.startDate, leave.endDate);
  return {
    released: affected.length,
    leave: serializeLeave(
      leave.id,
      leave.doctorId,
      displayName(leave.doctor.user),
      leave.startDate,
      leave.endDate,
      leave.reason,
      remaining,
      ownedDoctorId ? "doctor" : "admin",
    ),
  };
}

function serializeLeave(
  id: string,
  doctorId: string,
  doctorName: string,
  startDate: Date,
  endDate: Date,
  reason: string | null,
  affected: Awaited<ReturnType<typeof affectedAppointments>>,
  audience: "doctor" | "admin" = "admin",
) {
  return {
    id,
    doctorId,
    doctorName,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    reason,
    affectedAppointments: affected.length,
    appointments: affected.map((item) => serializeAppointment(item, audience)),
  };
}

export async function listLeaveWithConflicts(doctorId?: string) {
  const leaves = await prisma.doctorLeave.findMany({
    where: doctorId ? { doctorId } : undefined,
    include: { doctor: { include: { user: true } } },
    orderBy: { startDate: "desc" },
  });

  return Promise.all(
    leaves.map(async (leave) => {
      const affected = await affectedAppointments(leave.doctorId, leave.startDate, leave.endDate);
      return serializeLeave(
        leave.id,
        leave.doctorId,
        displayName(leave.doctor.user),
        leave.startDate,
        leave.endDate,
        leave.reason,
        affected,
        doctorId ? "doctor" : "admin",
      );
    }),
  );
}

export async function listLeaveForDoctor(doctorId: string) {
  return listLeaveWithConflicts(doctorId);
}
