import type { NotificationStatus, NotificationType } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { sendEmail, getEmailConfigurationState } from "./email.service.js";
import { recordSystemEvent } from "./system-event.service.js";

const RETRY_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

export async function queueUserNotification(input: {
  userId: string;
  email: string;
  appointmentId: string;
  type: NotificationType;
  subject: string;
  body: string;
  nextAttemptAt?: Date;
}): Promise<void> {
  await prisma.notification.upsert({
    where: {
      appointmentId_type_userId: {
        appointmentId: input.appointmentId,
        type: input.type,
        userId: input.userId,
      },
    },
    create: {
      userId: input.userId,
      appointmentId: input.appointmentId,
      type: input.type,
      status: "QUEUED",
      toEmail: input.email,
      subject: input.subject,
      body: input.body,
      nextAttemptAt: input.nextAttemptAt ?? new Date(),
      retryCount: 0,
      lastError: null,
      sentAt: null,
    },
    update: {
      status: "QUEUED",
      toEmail: input.email,
      subject: input.subject,
      body: input.body,
      nextAttemptAt: input.nextAttemptAt ?? new Date(),
      retryCount: 0,
      lastError: null,
      sentAt: null,
    },
  });
}

export async function processDueNotifications(limit = 10): Promise<number> {
  const due = await prisma.notification.findMany({
    where: {
      status: { in: ["QUEUED", "RETRYING"] },
      nextAttemptAt: { lte: new Date() },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  for (const notification of due) {
    const claimed = await prisma.notification.updateMany({
      where: { id: notification.id, status: { in: ["QUEUED", "RETRYING"] } },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) continue;

    if (notification.type === "APPOINTMENT_REMINDER") {
      const appointment = notification.appointmentId
        ? await prisma.appointment.findUnique({ where: { id: notification.appointmentId } })
        : null;
      if (!appointment || appointment.status !== "BOOKED") {
        await prisma.notification.update({
          where: { id: notification.id },
          data: {
            status: "FAILED",
            lastError: "Reminder cancelled because the appointment is no longer booked.",
          },
        });
        continue;
      }
    }

    try {
      const result = await sendEmail({
        to: notification.toEmail,
        subject: notification.subject,
        html: notification.body,
        text: notification.body.replace(/<[^>]+>/g, ""),
      });

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          lastError: null,
        },
      });

      await recordSystemEvent({
        type: "EMAIL_SENT",
        message: "Notification email sent.",
        entityType: "notification",
        entityId: notification.id,
        metadata: { providerId: result.providerId, type: notification.type },
      });
    } catch {
      const retryCount = notification.retryCount + 1;
      const exhausted = retryCount >= notification.maxRetries;
      const status: NotificationStatus = exhausted ? "FAILED" : "RETRYING";
      const delay = RETRY_BACKOFF_MS[Math.min(retryCount - 1, RETRY_BACKOFF_MS.length - 1)] ?? 600_000;
      const safeMessage = getEmailConfigurationState().configured
        ? "Delivery failed. CareFlow will retry automatically."
        : "Email is not configured. The appointment is unaffected.";

      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status,
          retryCount,
          nextAttemptAt: new Date(Date.now() + delay),
          lastError: safeMessage,
        },
      });

      await recordSystemEvent({
        type: exhausted ? "EMAIL_FAILED" : "EMAIL_RETRY",
        message: exhausted
          ? "Notification email failed after retries."
          : "Notification email failed and is scheduled for retry.",
        entityType: "notification",
        entityId: notification.id,
        metadata: { retryCount, status },
      });
    }
  }

  return due.length;
}
