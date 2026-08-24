import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import type { AuthUser } from "../middleware/auth.js";
import { Errors } from "../utils/app-error.js";
import { activeOccupancyKey } from "../utils/occupancy-key.js";
import { shouldSimulate } from "./demo-simulation.service.js";
import { recordSystemEvent } from "./system-event.service.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";
import { assertSlotBookable } from "./slot.service.js";
import { expireStaleHolds, expireSlotHoldInTx } from "./hold-expiry.service.js";
import { assertTransition } from "./appointment-state.js";
import { requireDoctorRecord } from "./appointment-access.service.js";
import {
  cancelAppointmentReminders,
  queueAppointmentReminder,
  rescheduleAppointmentReminder,
} from "./appointment-reminder.service.js";
import { ensureCalendarParticipants } from "./calendar.service.js";

function isUniqueOccupancyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function lockDoctor(tx: Prisma.TransactionClient, doctorId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM doctors WHERE id = ${doctorId} FOR UPDATE
  `;
  if (rows.length === 0) throw Errors.notFound("This doctor profile is not available.");
}

async function lockAppointment(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM appointments WHERE id = ${id} FOR UPDATE
  `;
  if (rows.length === 0) throw Errors.appointmentNotFound();
}

async function loadSerialized(id: string, audience: "patient" | "doctor" | "admin") {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  if (!appointment) throw Errors.appointmentNotFound();
  return serializeAppointment(appointment, audience);
}

function audienceFor(user: AuthUser): "patient" | "doctor" | "admin" {
  if (user.role === "ADMIN") return "admin";
  if (user.role === "DOCTOR") return "doctor";
  return "patient";
}

async function queueBookingSideEffects(input: {
  appointmentId: string;
  userId: string;
  email: string;
  startAt: Date;
  calendarAction: "create" | "update" | "delete";
  notificationType: "BOOKING_CONFIRMATION" | "CANCELLATION" | "RESCHEDULE";
  subject: string;
  body: string;
}) {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        appointmentId: input.appointmentId,
        type: input.notificationType,
        status: "QUEUED",
        toEmail: input.email,
        subject: input.subject,
        body: input.body,
      },
    });
    if (input.notificationType === "BOOKING_CONFIRMATION") {
      await prisma.job.create({
        data: {
          type: "GENERATE_PRE_VISIT_AI",
          payload: { appointmentId: input.appointmentId },
        },
      });
      await queueAppointmentReminder({
        appointmentId: input.appointmentId,
        userId: input.userId,
        email: input.email,
        startAt: input.startAt,
      });
    }
    await ensureCalendarParticipants(input.appointmentId);
    await prisma.job.create({
      data: {
        type: "CALENDAR_SYNC",
        payload: { appointmentId: input.appointmentId, action: input.calendarAction },
      },
    });
  } catch {
    // Side effects must not invalidate the appointment.
  }
}

export async function holdSlot(user: AuthUser, doctorId: string, startAt: Date) {
  if (user.role !== "PATIENT") {
    throw Errors.unauthorizedAppointmentAction();
  }
  if (await shouldSimulate("BOOKING_CONFLICT")) {
    await recordSystemEvent({
      type: "BOOKING_CONFLICT",
      message: "Simulated booking conflict.",
      actorUserId: user.id,
      entityType: "doctor",
      entityId: doctorId,
    });
    throw Errors.slotUnavailable();
  }

  const { endAt } = await assertSlotBookable(doctorId, startAt);
  const occupancyKey = activeOccupancyKey(startAt);
  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + env.SLOT_HOLD_MINUTES * 60_000);

  try {
    const held = await prisma.$transaction(async (tx) => {
      await lockDoctor(tx, doctorId);
      await expireSlotHoldInTx(tx, doctorId, occupancyKey, now);

      const existingSame = await tx.appointment.findFirst({
        where: {
          doctorId,
          occupancyKey,
          status: "HELD",
          heldByUserId: user.id,
        },
      });
      if (existingSame) {
        return tx.appointment.update({
          where: { id: existingSame.id },
          data: { holdExpiresAt, heldAt: now },
        });
      }

      const otherHolds = await tx.appointment.findMany({
        where: { heldByUserId: user.id, status: "HELD" },
        select: { id: true },
      });
      if (otherHolds.length > 0) {
        await tx.appointment.updateMany({
          where: { id: { in: otherHolds.map((row) => row.id) } },
          data: {
            status: "CANCELLED",
            occupancyKey: null,
            cancelReason: "PATIENT",
            cancelledAt: now,
          },
        });
      }

      return tx.appointment.create({
        data: {
          doctorId,
          patientId: user.id,
          startAt,
          endAt,
          status: "HELD",
          occupancyKey,
          heldByUserId: user.id,
          heldAt: now,
          holdExpiresAt,
          calendarSyncStatus: env.GOOGLE_CLIENT_ID ? "PENDING" : "NOT_CONNECTED",
          aiPreVisitStatus: "IDLE",
          timeline: {
            create: { code: "SLOT_HELD", label: "Slot temporarily reserved" },
          },
        },
      });
    });

    await recordSystemEvent({
      type: "SLOT_HELD",
      message: "A slot was held for booking.",
      actorUserId: user.id,
      entityType: "appointment",
      entityId: held.id,
    });

    return loadSerialized(held.id, "patient");
  } catch (error) {
    if (isUniqueOccupancyError(error)) {
      await recordSystemEvent({
        type: "BOOKING_CONFLICT",
        message: "Two booking attempts collided on the same slot.",
        actorUserId: user.id,
        entityType: "doctor",
        entityId: doctorId,
      });
      throw Errors.slotUnavailable();
    }
    throw error;
  }
}

export async function confirmHold(user: AuthUser, appointmentId: string, symptoms: string) {
  if (user.role !== "PATIENT") {
    throw Errors.unauthorizedAppointmentAction();
  }
  await expireStaleHolds();
  const now = new Date();

  if (await shouldSimulate("HOLD_EXPIRED")) {
    throw Errors.holdExpired();
  }

  const confirmed = await prisma.$transaction(async (tx) => {
    await lockAppointment(tx, appointmentId);
    const hold = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!hold) throw Errors.appointmentNotFound();
    if (hold.status === "HELD" && hold.heldByUserId !== user.id) {
      throw Errors.holdNotOwned();
    }
    if (hold.patientId !== user.id) {
      throw Errors.appointmentNotFound();
    }
    if (hold.status === "EXPIRED") {
      throw Errors.holdExpired();
    }
    if (hold.status !== "HELD") {
      throw Errors.invalidAppointmentState();
    }
    if (!hold.holdExpiresAt || hold.holdExpiresAt.getTime() <= now.getTime()) {
      throw Errors.holdExpired();
    }

    const updated = await tx.appointment.updateMany({
      where: {
        id: hold.id,
        status: "HELD",
        heldByUserId: user.id,
        holdExpiresAt: { gt: now },
      },
      data: {
        status: "BOOKED",
        symptoms,
        aiPreVisitStatus: "PENDING",
        calendarSyncStatus: env.GOOGLE_CLIENT_ID ? "PENDING" : "NOT_CONNECTED",
      },
    });
    if (updated.count === 0) {
      throw Errors.holdExpired();
    }

    await tx.appointmentTimelineEvent.create({
      data: {
        appointmentId: hold.id,
        code: "APPOINTMENT_CONFIRMED",
        label: "Appointment confirmed",
      },
    });
    return hold;
  });

  await recordSystemEvent({
    type: "BOOKING_CREATED",
    message: "Appointment confirmed.",
    actorUserId: user.id,
    entityType: "appointment",
    entityId: confirmed.id,
  });

  await queueBookingSideEffects({
    appointmentId: confirmed.id,
    userId: user.id,
    email: user.email,
    startAt: confirmed.startAt,
    calendarAction: "create",
    notificationType: "BOOKING_CONFIRMATION",
    subject: "Your CareFlow appointment is confirmed",
    body: "Your appointment is confirmed. A visit briefing will appear when available.",
  });

  return loadSerialized(confirmed.id, "patient");
}

export async function releaseHold(user: AuthUser, appointmentId: string) {
  const now = new Date();
  const hold = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!hold || hold.patientId !== user.id) {
    throw Errors.appointmentNotFound();
  }
  if (hold.status !== "HELD") {
    throw Errors.invalidAppointmentState();
  }

  assertTransition("HELD", "CANCELLED");
  await prisma.appointment.update({
    where: { id: hold.id },
    data: {
      status: "CANCELLED",
      occupancyKey: null,
      cancelReason: "PATIENT",
      cancelledAt: now,
    },
  });
  await prisma.appointmentTimelineEvent.create({
    data: {
      appointmentId: hold.id,
      code: "APPOINTMENT_CANCELLED",
      label: "Reservation released",
    },
  });
}

export async function cancelAppointment(user: AuthUser, appointmentId: string) {
  const now = new Date();
  const appointment = await prisma.$transaction(async (tx) => {
    await lockAppointment(tx, appointmentId);
    const row = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!row) throw Errors.appointmentNotFound();

    if (user.role === "PATIENT" && row.patientId !== user.id) {
      throw Errors.appointmentNotFound();
    }
    if (user.role === "DOCTOR") {
      const doctor = await requireDoctorRecord(user.id);
      if (row.doctorId !== doctor.id) throw Errors.appointmentNotFound();
    }

    if (row.status !== "BOOKED" && row.status !== "HELD") {
      throw Errors.invalidAppointmentState();
    }
    if (row.startAt.getTime() <= now.getTime() && row.status === "BOOKED") {
      throw Errors.invalidAppointmentState();
    }

    assertTransition(row.status, "CANCELLED");
    const cancelReason = user.role === "ADMIN" ? "ADMIN" : user.role === "DOCTOR" ? "DOCTOR" : "PATIENT";

    await tx.appointment.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        occupancyKey: null,
        cancelReason,
        cancelledAt: now,
      },
    });
    await tx.appointmentTimelineEvent.create({
      data: {
        appointmentId: row.id,
        code: "APPOINTMENT_CANCELLED",
        label: `Cancelled by ${cancelReason.toLowerCase()}`,
      },
    });
    return row;
  });

  await recordSystemEvent({
    type: "APPOINTMENT_CANCELLED",
    message: "Appointment cancelled.",
    actorUserId: user.id,
    entityType: "appointment",
    entityId: appointment.id,
  });

  if (appointment.status === "BOOKED" && appointment.patientId) {
    await cancelAppointmentReminders(appointment.id);
    const patient = await prisma.user.findUnique({ where: { id: appointment.patientId } });
    if (patient) {
      await queueBookingSideEffects({
        appointmentId: appointment.id,
        userId: patient.id,
        email: patient.email,
        startAt: appointment.startAt,
        calendarAction: "delete",
        notificationType: "CANCELLATION",
        subject: "Your CareFlow appointment was cancelled",
        body: "Your appointment was cancelled. The time is available again.",
      });
    }
  }

  return loadSerialized(appointment.id, audienceFor(user));
}

export async function rescheduleAppointment(user: AuthUser, appointmentId: string, startAt: Date) {
  if (user.role !== "PATIENT") {
    throw Errors.unauthorizedAppointmentAction();
  }
  await expireStaleHolds();
  if (await shouldSimulate("BOOKING_CONFLICT")) {
    throw Errors.slotUnavailable();
  }

  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockAppointment(tx, appointmentId);
      const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!current || current.patientId !== user.id) {
        throw Errors.appointmentNotFound();
      }
      if (current.status !== "BOOKED" || current.startAt.getTime() <= now.getTime()) {
        throw Errors.invalidAppointmentState();
      }
      if (current.startAt.getTime() === startAt.getTime()) {
        throw Errors.validation("Choose a different time to reschedule.");
      }

      await lockDoctor(tx, current.doctorId);
      const { endAt } = await assertSlotBookable(current.doctorId, startAt);
      const occupancyKey = activeOccupancyKey(startAt);
      await expireSlotHoldInTx(tx, current.doctorId, occupancyKey, now);

      const previousStart = current.startAt;
      await tx.appointment.update({
        where: { id: current.id },
        data: {
          startAt,
          endAt,
          occupancyKey,
          calendarSyncStatus: env.GOOGLE_CLIENT_ID ? "PENDING" : "NOT_CONNECTED",
        },
      });
      await tx.appointmentTimelineEvent.create({
        data: {
          appointmentId: current.id,
          code: "APPOINTMENT_RESCHEDULED",
          label: "Appointment rescheduled",
          metadata: { from: previousStart.toISOString(), to: startAt.toISOString() },
        },
      });
      return current;
    });

    await recordSystemEvent({
      type: "APPOINTMENT_RESCHEDULED",
      message: "Appointment rescheduled.",
      actorUserId: user.id,
      entityType: "appointment",
      entityId: result.id,
    });

    await queueBookingSideEffects({
      appointmentId: result.id,
      userId: user.id,
      email: user.email,
      startAt,
      calendarAction: "update",
      notificationType: "RESCHEDULE",
      subject: "Your CareFlow appointment was rescheduled",
      body: "Your appointment time was updated.",
    });
    await rescheduleAppointmentReminder({
      appointmentId: result.id,
      userId: user.id,
      email: user.email,
      startAt,
    }).catch(() => undefined);

    return loadSerialized(result.id, "patient");
  } catch (error) {
    if (isUniqueOccupancyError(error)) {
      await recordSystemEvent({
        type: "BOOKING_CONFLICT",
        message: "Reschedule collided with another booking.",
        actorUserId: user.id,
      });
      throw Errors.slotUnavailable();
    }
    throw error;
  }
}
