import type { NotificationStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { sendEmail, getEmailConfigurationState } from "./email.service.js";
import { recordSystemEvent } from "./system-event.service.js";

const RETRY_BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000];

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
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "PROCESSING" },
    });

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
