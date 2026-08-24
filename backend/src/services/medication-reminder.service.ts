import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { nextMedicationFireAt } from "../utils/medication-frequency.js";

export async function processDueMedicationReminders(limit = 20): Promise<number> {
  const due = await prisma.medicationReminder.findMany({
    where: {
      isActive: true,
      nextFireAt: { lte: new Date() },
    },
    include: { patient: true },
    orderBy: { nextFireAt: "asc" },
    take: limit,
  });

  for (const reminder of due) {
    await prisma.notification.create({
      data: {
        userId: reminder.patientId,
        appointmentId: reminder.appointmentId,
        type: "MEDICATION_REMINDER",
        status: "QUEUED",
        toEmail: reminder.patient.email,
        subject: `Medication reminder: ${reminder.medicationName}`,
        body: `Reminder to take ${reminder.medicationName} (${reminder.scheduleLabel}). This is not medical advice from CareFlow.`,
      },
    }).catch(() => undefined);

    const nextFireAt = nextMedicationFireAt(reminder.scheduleLabel, new Date(), env.CLINIC_TIMEZONE);
    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: {
        lastSentAt: new Date(),
        nextFireAt: nextFireAt ?? reminder.nextFireAt,
        isActive: nextFireAt !== null,
      },
    });
  }

  return due.length;
}
