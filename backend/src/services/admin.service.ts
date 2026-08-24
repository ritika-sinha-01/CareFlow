import bcrypt from "bcryptjs";
import { prisma } from "../db/prisma.js";
import { addCalendarDays, clinicDayBounds, clinicLocalToUtc, isoDate } from "../utils/clinic-time.js";
import { getSystemHealth } from "./health.service.js";
import { displayName, toPublicUser } from "../utils/serializers.js";
import { appointmentInclude, serializeAppointment } from "./appointment-serialize.js";
import type { z } from "zod";
import type { createDoctorSchema } from "../validators/auth.validators.js";
import { Errors } from "../utils/app-error.js";

function leaveEndExclusive(endDate: Date) {
  return clinicLocalToUtc(addCalendarDays(isoDate(endDate), 1), "00:00");
}

export async function getAdminDashboard() {
  const now = new Date();
  const { start: todayStart, endExclusive: todayEnd } = clinicDayBounds(now);

  const [doctors, patients, todayAppointments, upcomingAppointments, failedNotifications, leaves, health, events] =
    await Promise.all([
      prisma.doctor.count(),
      prisma.user.count({ where: { role: "PATIENT" } }),
      prisma.appointment.count({
        where: {
          status: { in: ["BOOKED", "HELD"] },
          startAt: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.appointment.count({
        where: {
          status: { in: ["BOOKED", "HELD"] },
          startAt: { gt: todayEnd },
        },
      }),
      prisma.notification.count({ where: { status: "FAILED" } }),
      prisma.doctorLeave.findMany({
        include: { doctor: { include: { user: true } } },
        orderBy: { startDate: "asc" },
      }),
      getSystemHealth(),
      prisma.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  const leaveConflicts = [];
  for (const leave of leaves) {
    const affected = await prisma.appointment.count({
      where: {
        doctorId: leave.doctorId,
        status: { in: ["BOOKED", "HELD"] },
        startAt: { gte: leave.startDate, lt: leaveEndExclusive(leave.endDate) },
      },
    });
    if (affected > 0) {
      leaveConflicts.push({
        leaveId: leave.id,
        doctorName: displayName(leave.doctor.user),
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
        affected,
      });
    }
  }

  return {
    totals: {
      doctors,
      patients,
      todayAppointments,
      upcomingAppointments,
      failedNotifications,
      leaveConflicts: leaveConflicts.length,
    },
    leaveConflicts,
    health,
    recentEvents: events.map((event) => ({
      id: event.id,
      type: event.type,
      message: event.message,
      createdAt: event.createdAt.toISOString(),
    })),
  };
}

export async function listAdminDoctors() {
  const doctors = await prisma.doctor.findMany({
    include: { user: true, workingHours: true, _count: { select: { appointments: true } } },
    orderBy: { specialization: "asc" },
  });
  return doctors.map((doctor) => ({
    id: doctor.id,
    name: displayName(doctor.user),
    email: doctor.user.email,
    specialization: doctor.specialization,
    slotDurationMin: doctor.slotDurationMin,
    yearsExperience: doctor.yearsExperience,
    isDemo: doctor.isDemo,
    appointmentCount: doctor._count.appointments,
  }));
}

export async function getAdminDoctor(id: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id },
    include: {
      user: true,
      workingHours: { orderBy: { weekday: "asc" } },
      leaves: { orderBy: { startDate: "desc" } },
    },
  });
  if (!doctor) throw Errors.notFound("This doctor profile is not available.");

  return {
    id: doctor.id,
    user: toPublicUser(doctor.user),
    specialization: doctor.specialization,
    bio: doctor.bio,
    slotDurationMin: doctor.slotDurationMin,
    yearsExperience: doctor.yearsExperience,
    isDemo: doctor.isDemo,
    calendarConnected: doctor.user.calendarConnected,
    workingHours: doctor.workingHours,
    leaves: doctor.leaves.map((leave) => ({
      id: leave.id,
      startDate: leave.startDate.toISOString(),
      endDate: leave.endDate.toISOString(),
      reason: leave.reason,
    })),
  };
}

export async function createDoctor(input: z.infer<typeof createDoctorSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw Errors.conflict("An account with this email already exists.");

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, 10),
      role: "DOCTOR",
      firstName: input.firstName,
      lastName: input.lastName,
      doctor: {
        create: {
          specialization: input.specialization,
          slotDurationMin: input.slotDurationMin,
          yearsExperience: input.yearsExperience,
          bio: input.bio ?? "Clinician profile created in CareFlow.",
          workingHours: {
            create: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              startTime: "09:00",
              endTime: "17:00",
            })),
          },
        },
      },
    },
    include: { doctor: true },
  });

  return {
    user: toPublicUser(user),
    doctorId: user.doctor?.id,
  };
}

export async function listAdminAppointments() {
  const rows = await prisma.appointment.findMany({
    include: appointmentInclude,
    orderBy: { startAt: "desc" },
    take: 50,
  });
  return rows.map((item) => serializeAppointment(item, "admin"));
}

export async function listAdminLeave() {
  const leaves = await prisma.doctorLeave.findMany({
    include: { doctor: { include: { user: true } } },
    orderBy: { startDate: "desc" },
  });

  return Promise.all(
    leaves.map(async (leave) => {
      const affected = await prisma.appointment.count({
        where: {
          doctorId: leave.doctorId,
          status: { in: ["BOOKED", "HELD"] },
          startAt: { gte: leave.startDate, lt: leaveEndExclusive(leave.endDate) },
        },
      });
      return {
        id: leave.id,
        doctorName: displayName(leave.doctor.user),
        doctorId: leave.doctorId,
        startDate: leave.startDate.toISOString(),
        endDate: leave.endDate.toISOString(),
        reason: leave.reason,
        affectedAppointments: affected,
      };
    }),
  );
}

export async function listAdminNotifications() {
  const rows = await prisma.notification.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { user: true },
  });
  return rows.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.status,
    toEmail: item.toEmail,
    subject: item.subject,
    retryCount: item.retryCount,
    lastError: item.lastError,
    sentAt: item.sentAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    userName: displayName(item.user),
  }));
}
