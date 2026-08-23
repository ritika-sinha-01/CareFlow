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
import { expireStaleHolds } from "./hold-expiry.service.js";

function isUniqueOccupancyError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function lockDoctor(tx: Prisma.TransactionClient, doctorId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM doctors WHERE id = ${doctorId} FOR UPDATE
  `;
  if (rows.length === 0) throw Errors.notFound("This doctor profile is not available.");
}

async function loadSerialized(id: string, audience: "patient") {
  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: appointmentInclude,
  });
  if (!appointment) throw Errors.notFound("This appointment is not available.");
  return serializeAppointment(appointment, audience);
}

async function queueBookingSideEffects(input: {
  appointmentId: string;
  userId: string;
  email: string;
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
    }
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
  await expireStaleHolds();
  if (shouldSimulate("BOOKING_CONFLICT")) {
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
            create: { code: "SLOT_RESERVED", label: "Slot temporarily reserved" },
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
  await expireStaleHolds();
  const now = new Date();

  const confirmed = await prisma.$transaction(async (tx) => {
    const hold = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!hold || hold.patientId !== user.id) {
      throw Errors.notFound("This appointment is not available.");
    }
    if (hold.status !== "HELD" || hold.heldByUserId !== user.id) {
      throw Errors.notFound("This appointment is not available.");
    }
    if (!hold.holdExpiresAt || hold.holdExpiresAt.getTime() <= now.getTime()) {
      throw Errors.holdExpired();
    }

    await tx.appointment.update({
      where: { id: hold.id },
      data: {
        status: "BOOKED",
        symptoms,
        aiPreVisitStatus: "PENDING",
        calendarSyncStatus: env.GOOGLE_CLIENT_ID ? "PENDING" : "NOT_CONNECTED",
      },
    });
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
  if (!hold || hold.patientId !== user.id || hold.status !== "HELD") {
    throw Errors.notFound("This appointment is not available.");
  }

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
      code: "CANCELLED",
      label: "Reservation released",
    },
  });
}

export async function cancelAppointment(user: AuthUser, appointmentId: string) {
  const now = new Date();
  const appointment = await prisma.$transaction(async (tx) => {
    const row = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!row || row.patientId !== user.id) {
      throw Errors.notFound("This appointment is not available.");
    }
    if (row.status !== "BOOKED" && row.status !== "HELD") {
      throw Errors.notCancellable();
    }
    if (row.startAt.getTime() <= now.getTime() && row.status === "BOOKED") {
      throw Errors.notCancellable();
    }

    await tx.appointment.update({
      where: { id: row.id },
      data: {
        status: "CANCELLED",
        occupancyKey: null,
        cancelReason: "PATIENT",
        cancelledAt: now,
      },
    });
    await tx.appointmentTimelineEvent.create({
      data: {
        appointmentId: row.id,
        code: "CANCELLED",
        label: "Cancelled by patient",
      },
    });
    return row;
  });

  await recordSystemEvent({
    type: "APPOINTMENT_CANCELLED",
    message: "Appointment cancelled by patient.",
    actorUserId: user.id,
    entityType: "appointment",
    entityId: appointment.id,
  });

  if (appointment.status === "BOOKED") {
    await queueBookingSideEffects({
      appointmentId: appointment.id,
      userId: user.id,
      email: user.email,
      calendarAction: "delete",
      notificationType: "CANCELLATION",
      subject: "Your CareFlow appointment was cancelled",
      body: "Your appointment was cancelled. The time is available again.",
    });
  }

  return loadSerialized(appointment.id, "patient");
}

export async function rescheduleAppointment(user: AuthUser, appointmentId: string, startAt: Date) {
  await expireStaleHolds();
  if (shouldSimulate("BOOKING_CONFLICT")) {
    throw Errors.slotUnavailable();
  }

  const now = new Date();
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.appointment.findUnique({ where: { id: appointmentId } });
      if (!current || current.patientId !== user.id) {
        throw Errors.notFound("This appointment is not available.");
      }
      if (current.status !== "BOOKED" || current.startAt.getTime() <= now.getTime()) {
        throw Errors.notCancellable();
      }

      if (current.startAt.getTime() === startAt.getTime()) {
        throw Errors.validation("Choose a different time to reschedule.");
      }

      await lockDoctor(tx, current.doctorId);
      const { endAt } = await assertSlotBookable(current.doctorId, startAt);

      const created = await tx.appointment.create({
        data: {
          doctorId: current.doctorId,
          patientId: user.id,
          startAt,
          endAt,
          status: "BOOKED",
          occupancyKey: activeOccupancyKey(startAt),
          symptoms: current.symptoms,
          rescheduledFromId: current.id,
          aiPreVisitStatus: current.aiPreVisitStatus,
          aiUrgency: current.aiUrgency,
          aiChiefComplaint: current.aiChiefComplaint,
          aiSuggestedQuestions: current.aiSuggestedQuestions ?? undefined,
          aiKeySymptoms: current.aiKeySymptoms ?? undefined,
          calendarSyncStatus: env.GOOGLE_CLIENT_ID ? "PENDING" : "NOT_CONNECTED",
          timeline: {
            create: [
              { code: "SLOT_RESERVED", label: "Slot reserved" },
              { code: "APPOINTMENT_CONFIRMED", label: "Appointment rescheduled" },
            ],
          },
        },
      });

      await tx.appointment.update({
        where: { id: current.id },
        data: {
          status: "CANCELLED",
          occupancyKey: null,
          cancelReason: "PATIENT",
          cancelledAt: now,
        },
      });
      await tx.appointmentTimelineEvent.create({
        data: {
          appointmentId: current.id,
          code: "RESCHEDULED",
          label: "Rescheduled to a new time",
        },
      });
      return created;
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
      calendarAction: "update",
      notificationType: "RESCHEDULE",
      subject: "Your CareFlow appointment was rescheduled",
      body: "Your appointment time was updated.",
    });

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
