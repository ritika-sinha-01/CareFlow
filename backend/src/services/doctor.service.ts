import { prisma } from "../db/prisma.js";
import type { AuthUser } from "../middleware/auth.js";
import { Errors } from "../utils/app-error.js";
import { displayName, toPublicUser } from "../utils/serializers.js";
import { requireDoctorRecord } from "./appointment-access.service.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

export async function getDoctorDashboard(user: AuthUser) {
  const doctor = await requireDoctorRecord(user.id);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const [profile, today, upcoming] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: { in: ["BOOKED", "HELD"] },
        startAt: { gte: todayStart, lte: todayEnd },
      },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId: doctor.id,
        status: { in: ["BOOKED", "HELD"] },
        startAt: { gt: todayEnd },
      },
      include: appointmentInclude,
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);

  const urgency = { LOW: 0, MEDIUM: 0, HIGH: 0 };
  for (const appointment of today) {
    if (appointment.aiUrgency) urgency[appointment.aiUrgency] += 1;
  }

  const pendingConsultations = today.filter((item) => !item.clinicalNotes && item.status === "BOOKED");
  const followUps = today.filter((item) => Boolean(item.followUpSteps));

  const nextToday = today.find((item) => item.startAt >= now) ?? today[0];
  const nextAppointment = nextToday
    ? serializeAppointment(nextToday, "doctor")
    : upcoming[0]
      ? serializeAppointment(upcoming[0], "doctor")
      : null;

  return {
    user: toPublicUser(profile),
    doctor: {
      id: doctor.id,
      specialization: doctor.specialization,
      isDemo: doctor.isDemo,
    },
    todayCount: today.length,
    nextAppointment,
    urgency,
    pendingConsultations: pendingConsultations.length,
    followUps: followUps.length,
    today: today.map((item) => serializeAppointment(item, "doctor")),
    upcoming: upcoming.map((item) => serializeAppointment(item, "doctor")),
  };
}

export async function listDoctorAppointments(user: AuthUser) {
  const doctor = await requireDoctorRecord(user.id);
  const rows = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, status: { not: "BLOCKED" } },
    include: appointmentInclude,
    orderBy: { startAt: "desc" },
  });
  return rows.map((item) => serializeAppointment(item, "doctor"));
}

export async function listDoctorPatients(user: AuthUser) {
  const doctor = await requireDoctorRecord(user.id);
  const rows = await prisma.appointment.findMany({
    where: { doctorId: doctor.id, patientId: { not: null } },
    include: { patient: true },
    orderBy: { startAt: "desc" },
  });

  const unique = new Map<string, { id: string; name: string; email: string; lastVisitAt: string }>();
  for (const row of rows) {
    if (!row.patient) continue;
    if (unique.has(row.patient.id)) continue;
    unique.set(row.patient.id, {
      id: row.patient.id,
      name: displayName(row.patient),
      email: row.patient.email,
      lastVisitAt: row.startAt.toISOString(),
    });
  }

  return [...unique.values()];
}

export async function getDoctorProfile(user: AuthUser) {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.id },
    include: { user: true, workingHours: { orderBy: { weekday: "asc" } } },
  });
  if (!doctor) throw Errors.notFound("This doctor profile is not available.");

  return {
    user: toPublicUser(doctor.user),
    doctor: {
      id: doctor.id,
      specialization: doctor.specialization,
      bio: doctor.bio,
      slotDurationMin: doctor.slotDurationMin,
      yearsExperience: doctor.yearsExperience,
      isDemo: doctor.isDemo,
      calendarConnected: doctor.calendarConnected,
      workingHours: doctor.workingHours,
    },
  };
}
