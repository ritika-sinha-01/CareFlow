import { AppointmentStatus, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { recordSystemEvent } from "./system-event.service.js";
import { assertTransition } from "./appointment-state.js";

export async function expireSlotHoldInTx(
  tx: Prisma.TransactionClient,
  doctorId: string,
  occupancyKey: string,
  now = new Date(),
): Promise<number> {
  const expired = await tx.appointment.findMany({
    where: {
      doctorId,
      occupancyKey,
      status: AppointmentStatus.HELD,
      holdExpiresAt: { lte: now },
    },
    select: { id: true },
  });
  if (expired.length === 0) return 0;

  for (const row of expired) {
    assertTransition("HELD", "EXPIRED");
    await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${row.id} FOR UPDATE`;
  }

  await tx.appointment.updateMany({
    where: { id: { in: expired.map((row) => row.id) }, status: AppointmentStatus.HELD },
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
      code: "SLOT_EXPIRED",
      label: "Hold expired — slot released",
      occurredAt: now,
    })),
  });
  return expired.length;
}

export async function expireStaleHolds(now = new Date()): Promise<number> {
  const expired = await prisma.$transaction(async (tx) => {
    const rows = await tx.appointment.findMany({
      where: {
        status: AppointmentStatus.HELD,
        holdExpiresAt: { lte: now },
      },
      select: { id: true },
    });
    if (rows.length === 0) return [] as Array<{ id: string }>;

    for (const row of rows) {
      await tx.$queryRaw`SELECT id FROM appointments WHERE id = ${row.id} FOR UPDATE`;
    }

    await tx.appointment.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, status: AppointmentStatus.HELD },
      data: {
        status: AppointmentStatus.EXPIRED,
        occupancyKey: null,
        cancelledAt: now,
        cancelReason: "EXPIRED_HOLD",
      },
    });
    await tx.appointmentTimelineEvent.createMany({
      data: rows.map((row) => ({
        appointmentId: row.id,
        code: "SLOT_EXPIRED" as const,
        label: "Hold expired — slot released",
        occurredAt: now,
      })),
    });
    return rows;
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
