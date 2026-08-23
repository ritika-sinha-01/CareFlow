import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { generatePreVisitBriefing } from "../src/services/ai.service.js";
import { syncAppointmentCalendar } from "../src/services/calendar.service.js";
import { processDueJobs } from "../src/services/job.service.js";
import { resetSimulationFlags, setSimulationFlag } from "../src/services/demo-simulation.service.js";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";

const app = createApp();
const password = "CareFlow!demo1";

function nextMonday(hour: number, minute: number) {
  const date = new Date();
  const daysUntilMonday = (1 + 7 - date.getDay()) % 7 || 7;
  date.setDate(date.getDate() + daysUntilMonday);
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 7);
  return date;
}

describe("AI, leave, and calendar reliability", () => {
  let doctorId = "";
  let patientToken = "";
  let adminToken = "";
  let appointmentId = "";
  const slot = nextMonday(11, 0);

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;
    const doctorUser = await prisma.user.create({
      data: {
        email: `phase4.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Phase",
        lastName: "Four",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "Reliability",
        slotDurationMin: 30,
        workingHours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startTime: "09:00",
            endTime: "17:00",
          })),
        },
      },
    });
    doctorId = doctor.id;

    const patient = await request(app).post("/api/auth/register").send({
      email: `phase4.pat.${suffix}@careflow.demo`,
      password,
      firstName: "Phase",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;

    const admin = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@careflow.demo", password });
    adminToken = admin.body.data.token;

    const endAt = new Date(slot.getTime() + 30 * 60_000);
    const created = await prisma.appointment.create({
      data: {
        doctorId,
        patientId: patient.body.data.user.id,
        startAt: slot,
        endAt,
        status: "BOOKED",
        occupancyKey: activeOccupancyKey(slot),
        symptoms: "Mild sore throat for two days without breathing difficulty.",
        aiPreVisitStatus: "PENDING",
        calendarSyncStatus: "PENDING",
      },
    });
    appointmentId = created.id;
  });

  afterAll(async () => {
    resetSimulationFlags();
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
      await prisma.doctorLeave.deleteMany({ where: { doctorId } });
    }
  });

  it("keeps the appointment when AI is not configured", async () => {
    await generatePreVisitBriefing(appointmentId);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(row.aiPreVisitStatus).toBe("FAILED");
    expect(row.symptoms).toContain("sore throat");
  });

  it("completes an AI job without invalidating the visit", async () => {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { aiPreVisitStatus: "PENDING", aiPreVisitError: null },
    });
    await prisma.job.create({
      data: {
        type: "GENERATE_PRE_VISIT_AI",
        payload: { appointmentId },
      },
    });
    await processDueJobs(20);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(row.aiPreVisitStatus).toBe("FAILED");
  });

  it("marks calendar unavailable and leaves the booking intact", async () => {
    await syncAppointmentCalendar(appointmentId, "create");
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(["UNAVAILABLE", "NOT_CONNECTED"]).toContain(row.calendarSyncStatus);
  });

  it("records leave overlaps and releases them without deleting history", async () => {
    const dateStr = `${slot.getFullYear()}-${String(slot.getMonth() + 1).padStart(2, "0")}-${String(slot.getDate()).padStart(2, "0")}`;
    const created = await request(app)
      .post("/api/admin/leave")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctorId, startDate: dateStr, endDate: dateStr, reason: "Conference" });
    expect(created.status).toBe(201);
    expect(created.body.data.affectedAppointments).toBeGreaterThanOrEqual(1);

    const resolved = await request(app)
      .post(`/api/admin/leave/${created.body.data.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.released).toBeGreaterThanOrEqual(1);

    const visit = await request(app)
      .get(`/api/patient/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(visit.status).toBe(200);
    expect(visit.body.data.status).toBe("CANCELLED");

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.occupancyKey).toBeNull();

    const blocked = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("DOCTOR_UNAVAILABLE");
  });

  it("does not change appointments when leave resolution is simulated as failing", async () => {
    const later = nextMonday(15, 0);
    const endAt = new Date(later.getTime() + 30 * 60_000);
    const patient = await prisma.appointment.findFirst({
      where: { id: appointmentId },
      select: { patientId: true },
    });
    const extra = await prisma.appointment.create({
      data: {
        doctorId,
        patientId: patient?.patientId,
        startAt: later,
        endAt,
        status: "BOOKED",
        occupancyKey: activeOccupancyKey(later),
        symptoms: "Follow-up for a previously cancelled throat visit.",
      },
    });
    const dateStr = `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}`;
    const created = await request(app)
      .post("/api/admin/leave")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctorId, startDate: dateStr, endDate: dateStr, reason: "Simulated" });
    setSimulationFlag("LEAVE_CONFLICT", true);
    const failed = await request(app)
      .post(`/api/admin/leave/${created.body.data.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(failed.status).toBe(409);
    const still = await prisma.appointment.findUniqueOrThrow({ where: { id: extra.id } });
    expect(still.status).toBe("BOOKED");
    resetSimulationFlags();
    await request(app)
      .post(`/api/admin/leave/${created.body.data.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`);
  });
});
