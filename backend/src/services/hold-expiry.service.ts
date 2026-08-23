import { AppointmentStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { recordSystemEvent } from "./system-event.service.js";

export async function expireStaleHolds(now = new Date()): Promise<number> {
  const expired = await prisma.appointment.findMany({
    where: {
      status: AppointmentStatus.HELD,
      holdExpiresAt: { lte: now },
    },
    select: { id: true },
  });

  if (expired.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({
      where: { id: { in: expired.map((row) => row.id) } },
      data: {
        status: AppointmentStatus.EXPIRED,
        occupancyKey: null,
        cancelledAt: now,
        cancelReason: "EXPIRED_HOLD",
      },
    });

    await tx.appointmentTimelineEvent.createMany({
      data: expired.map((row) => ({
        appointmentId: row.id,
        code: "CANCELLED",
        label: "Hold expired — slot released",
        occurredAt: now,
      })),
    });
  });

  for (const row of expired) {
    await recordSystemEvent({
      type: "SLOT_EXPIRED",
      message: "A slot hold expired and was released.",
      entityType: "appointment",
      entityId: row.id,
    });
  }

  return expired.length;
}
