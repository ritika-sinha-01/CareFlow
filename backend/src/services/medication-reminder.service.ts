import { prisma } from "../db/prisma.js";

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
    const nextFireAt = new Date(reminder.nextFireAt.getTime() + 24 * 60 * 60_000);
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
    });
    await prisma.medicationReminder.update({
      where: { id: reminder.id },
      data: {
        lastSentAt: new Date(),
        nextFireAt,
      },
    });
  }

  return due.length;
}
