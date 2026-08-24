import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { queueUserNotification } from "./notification.service.js";

export function reminderFireAt(startAt: Date, now = new Date()): Date {
  const leadMs = env.APPOINTMENT_REMINDER_HOURS * 60 * 60 * 1000;
  const fireAt = new Date(startAt.getTime() - leadMs);
  return fireAt.getTime() <= now.getTime() ? now : fireAt;
}

export async function queueAppointmentReminders(appointmentId: string, startAt: Date): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: { include: { user: true } }, patient: true },
  });
  if (!appointment) return;

  const nextAttemptAt = reminderFireAt(startAt);
  const recipients = new Map<string, { id: string; email: string }>();
  if (appointment.patient) {
    recipients.set(appointment.patient.id, { id: appointment.patient.id, email: appointment.patient.email });
  }
  recipients.set(appointment.doctor.user.id, {
    id: appointment.doctor.user.id,
    email: appointment.doctor.user.email,
  });

  for (const recipient of recipients.values()) {
    await queueUserNotification({
      userId: recipient.id,
      email: recipient.email,
      appointmentId,
      type: "APPOINTMENT_REMINDER",
      subject: "Reminder: CareFlow appointment",
      body: "This is a reminder for an upcoming CareFlow appointment. The visit itself is unchanged if this email is delayed.",
      nextAttemptAt,
    });
  }
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
  await queueAppointmentReminders(input.appointmentId, input.startAt);
}
