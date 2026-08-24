import { prisma } from "../db/prisma.js";
import type { AuthUser } from "../middleware/auth.js";
import { Errors } from "../utils/app-error.js";
import { displayName, toPublicUser } from "../utils/serializers.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";
import { nextAvailableSlot } from "./slot.service.js";

export async function getPatientDashboard(user: AuthUser) {
  const now = new Date();
  const [profile, upcoming, reminders] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    prisma.appointment.findMany({
      where: {
        patientId: user.id,
        status: { in: ["BOOKED", "HELD"] },
        startAt: { gte: now },
      },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    prisma.medicationReminder.findMany({
      where: { patientId: user.id, isActive: true },
      orderBy: { nextFireAt: "asc" },
      take: 5,
    }),
  ]);

  if (!profile) throw Errors.unauthorized();

  const recent = await prisma.appointment.findMany({
    where: { patientId: user.id, status: { in: ["BOOKED", "CANCELLED"] } },
    include: appointmentInclude,
    orderBy: { startAt: "desc" },
    take: 4,
  });

  return {
    user: toPublicUser(profile),
    nextAppointment: upcoming[0] ? serializeAppointment(upcoming[0], "patient") : null,
    upcoming: upcoming.map((item) => serializeAppointment(item, "patient")),
    medications: reminders.map((item) => ({
      id: item.id,
      medicationName: item.medicationName,
      scheduleLabel: item.scheduleLabel,
      nextFireAt: item.nextFireAt.toISOString(),
    })),
    recentCare: recent.map((item) => serializeAppointment(item, "patient")),
  };
}

export async function listPatientAppointments(user: AuthUser) {
  const rows = await prisma.appointment.findMany({
    where: { patientId: user.id },
    include: appointmentInclude,
    orderBy: { startAt: "desc" },
  });
  return rows.map((item) => serializeAppointment(item, "patient"));
}

export async function listPatientMedications(user: AuthUser) {
  return prisma.medicationReminder.findMany({
    where: { patientId: user.id },
    orderBy: { nextFireAt: "asc" },
  }).then((rows) =>
    rows.map((item) => ({
      id: item.id,
      appointmentId: item.appointmentId,
      medicationName: item.medicationName,
      scheduleLabel: item.scheduleLabel,
      nextFireAt: item.nextFireAt.toISOString(),
      lastSentAt: item.lastSentAt?.toISOString() ?? null,
      isActive: item.isActive,
    })),
  );
}

export async function listDoctorsForPatients(specialization?: string) {
  const doctors = await prisma.doctor.findMany({
    where: specialization
      ? { specialization: { contains: specialization, mode: "insensitive" } }
      : undefined,
    include: {
      user: true,
      workingHours: { orderBy: { weekday: "asc" } },
    },
    orderBy: [{ isDemo: "desc" }, { specialization: "asc" }],
  });

  return Promise.all(
    doctors.map(async (doctor) => ({
      id: doctor.id,
      name: displayName(doctor.user),
      specialization: doctor.specialization,
      bio: doctor.bio,
      slotDurationMin: doctor.slotDurationMin,
      yearsExperience: doctor.yearsExperience,
      isDemo: doctor.isDemo,
      workingHours: doctor.workingHours.map((row) => ({
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
      })),
      nextAvailableAt: await nextAvailableSlot(doctor.id),
    })),
  );
}

export async function getDoctorForPatient(id: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: {
      user: true,
      workingHours: { orderBy: { weekday: "asc" } },
    },
  });
  if (!doctor) throw Errors.notFound("This doctor profile is not available.");

  return {
    id: doctor.id,
    name: displayName(doctor.user),
    specialization: doctor.specialization,
    bio: doctor.bio,
    slotDurationMin: doctor.slotDurationMin,
    yearsExperience: doctor.yearsExperience,
    isDemo: doctor.isDemo,
    workingHours: doctor.workingHours.map((row) => ({
      weekday: row.weekday,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
    nextAvailableAt: await nextAvailableSlot(doctor.id),
  };
}
