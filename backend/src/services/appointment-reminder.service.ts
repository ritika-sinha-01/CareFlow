import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export function reminderFireAt(startAt: Date, now = new Date()): Date {
  const leadMs = env.APPOINTMENT_REMINDER_HOURS * 60 * 60 * 1000;
  const fireAt = new Date(startAt.getTime() - leadMs);
  return fireAt.getTime() <= now.getTime() ? now : fireAt;
}

export async function queueAppointmentReminder(input: {
  appointmentId: string;
  userId: string;
  email: string;
  startAt: Date;
}): Promise<void> {
  const nextAttemptAt = reminderFireAt(input.startAt);
  await prisma.notification.upsert({
    where: {
      appointmentId_type: {
        appointmentId: input.appointmentId,
        type: "APPOINTMENT_REMINDER",
      },
    },
    create: {
      userId: input.userId,
      appointmentId: input.appointmentId,
      type: "APPOINTMENT_REMINDER",
      status: "QUEUED",
      toEmail: input.email,
      subject: "Reminder: your CareFlow appointment",
      body: "This is a reminder for your upcoming appointment. The visit itself is unchanged if this email is delayed.",
      nextAttemptAt,
      retryCount: 0,
      lastError: null,
      sentAt: null,
    },
    update: {
      status: "QUEUED",
      toEmail: input.email,
      subject: "Reminder: your CareFlow appointment",
      body: "This is a reminder for your upcoming appointment. The visit itself is unchanged if this email is delayed.",
      nextAttemptAt,
      retryCount: 0,
      lastError: null,
      sentAt: null,
    },
  });
}

export async function cancelAppointmentReminders(appointmentId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      appointmentId,
      type: "APPOINTMENT_REMINDER",
      status: { in: ["QUEUED", "RETRYING", "PROCESSING"] },
    },
    data: {
      status: "FAILED",
      lastError: "Reminder cancelled because the appointment is no longer booked.",
    },
  });
}

export async function rescheduleAppointmentReminder(input: {
  appointmentId: string;
  userId: string;
  email: string;
  startAt: Date;
}): Promise<void> {
  await queueAppointmentReminder(input);
}
