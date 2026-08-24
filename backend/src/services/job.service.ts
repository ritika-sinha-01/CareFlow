import type { Job, JobStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { nextRetryAt } from "../jobs/retry.js";
import { generatePostVisitSummary, generatePreVisitBriefing } from "./ai.service.js";
import { syncAppointmentCalendar } from "./calendar.service.js";

type JobPayload = {
  appointmentId?: string;
  action?: "create" | "update" | "delete";
};

function payloadOf(job: Job): JobPayload {
  return (job.payload ?? {}) as JobPayload;
}

export async function processDueJobs(limit = 10): Promise<number> {
  const due = await prisma.job.findMany({
    where: {
      status: { in: ["QUEUED", "RETRYING"] },
      availableAt: { lte: new Date() },
    },
    orderBy: { availableAt: "asc" },
    take: limit,
  });

  for (const job of due) {
    const claimed = await prisma.job.updateMany({
      where: { id: job.id, status: { in: ["QUEUED", "RETRYING"] } },
      data: { status: "PROCESSING" },
    });
    if (claimed.count === 0) continue;

    try {
      await runJob(job);
      await prisma.job.update({
        where: { id: job.id },
        data: { status: "COMPLETED", processedAt: new Date(), lastError: null },
      });
    } catch (error) {
      const retryCount = job.retryCount + 1;
      const exhausted = retryCount >= job.maxRetries;
      const status: JobStatus = exhausted ? "FAILED" : "RETRYING";
      await prisma.job.update({
        where: { id: job.id },
        data: {
          status,
          retryCount,
          availableAt: nextRetryAt(retryCount),
          lastError: error instanceof Error ? error.message : "Job failed.",
          processedAt: exhausted ? new Date() : null,
        },
      });

      const appointmentId = payloadOf(job).appointmentId;
      if (exhausted && appointmentId) {
        if (job.type === "GENERATE_PRE_VISIT_AI") {
          await prisma.appointment.updateMany({
            where: { id: appointmentId, aiPreVisitStatus: { in: ["PENDING", "RETRYING"] } },
            data: { aiPreVisitStatus: "FAILED" },
          });
        }
        if (job.type === "CALENDAR_SYNC") {
          await prisma.appointmentCalendarEvent.updateMany({
            where: { appointmentId, syncStatus: { in: ["PENDING", "RETRYING"] } },
            data: { syncStatus: "FAILED" },
          });
          await prisma.appointment.updateMany({
            where: { id: appointmentId, calendarSyncStatus: { in: ["PENDING", "RETRYING"] } },
            data: { calendarSyncStatus: "FAILED" },
          });
        }
      }
    }
  }

  return due.length;
}

async function runJob(job: Job) {
  const payload = payloadOf(job);
  if (job.type === "GENERATE_PRE_VISIT_AI") {
    if (!payload.appointmentId) return;
    await generatePreVisitBriefing(payload.appointmentId);
    return;
  }
  if (job.type === "GENERATE_POST_VISIT_AI") {
    if (!payload.appointmentId) return;
    await generatePostVisitSummary(payload.appointmentId);
    return;
  }
  if (job.type === "CALENDAR_SYNC") {
    if (!payload.appointmentId) return;
    await syncAppointmentCalendar(payload.appointmentId, payload.action ?? "create");
  }
}
