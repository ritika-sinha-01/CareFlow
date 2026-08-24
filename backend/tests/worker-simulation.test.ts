import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { MockAiAdapter, createAiAdapter, setAiAdapter } from "../src/services/ai.service.js";
import { MockCalendarAdapter, createCalendarAdapter, setCalendarAdapter } from "../src/services/calendar.service.js";
import { resetSimulationFlags } from "../src/services/demo-simulation.service.js";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";
import { drainJobs, drainNotifications, nextClinicMonday } from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("shared demo simulation across API and worker", () => {
  let doctorId = "";
  let doctorUserId = "";
  let patientId = "";
  let patientToken = "";
  let adminToken = "";
  let appointmentId = "";
  const slot = nextClinicMonday("10:00");
  const symptoms = "Mild sore throat for two days without breathing difficulty.";

  beforeAll(async () => {
    await resetSimulationFlags();
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;

    const admin = await prisma.user.create({
      data: {
        email: `sim.admin.${suffix}@careflow.demo`,
        passwordHash,
        role: "ADMIN",
        firstName: "Sim",
        lastName: "Admin",
      },
    });
    const adminLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: admin.email, password });
    adminToken = adminLogin.body.data.token;

    const doctorUser = await prisma.user.create({
      data: {
        email: `sim.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Sim",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "Simulation",
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
    doctorUserId = doctorUser.id;

    const patient = await request(app).post("/api/auth/register").send({
      email: `sim.pat.${suffix}@careflow.demo`,
      password,
      firstName: "Sim",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;
    patientId = patient.body.data.user.id;

    const created = await prisma.appointment.create({
      data: {
        doctorId,
        patientId,
        startAt: slot,
        endAt: new Date(slot.getTime() + 30 * 60_000),
        status: "BOOKED",
        occupancyKey: activeOccupancyKey(slot),
        symptoms,
        aiPreVisitStatus: "PENDING",
        calendarSyncStatus: "PENDING",
      },
    });
    appointmentId = created.id;
  });

  afterAll(async () => {
    await resetSimulationFlags();
    setAiAdapter(createAiAdapter());
    setCalendarAdapter(createCalendarAdapter());
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
      await prisma.doctor.deleteMany({ where: { id: doctorId } });
    }
  });

  it("rejects simulation controls without admin authorization", async () => {
    const denied = await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ flag: "AI", enabled: true });
    expect(denied.status).toBe(403);
  });

  it("lets API-created AI flags fail worker jobs without breaking the booking", async () => {
    const toggle = await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ flag: "AI", enabled: true });
    expect(toggle.status).toBe(200);
    expect(toggle.body.data.activeFlags).toContain("AI");

    const aiJob = await prisma.job.create({
      data: {
        type: "GENERATE_PRE_VISIT_AI",
        payload: { appointmentId },
      },
    });

    await drainJobs();
    const job = await prisma.job.findUniqueOrThrow({ where: { id: aiJob.id } });
    expect(job.status).toBe("RETRYING");
    expect(job.retryCount).toBeGreaterThan(0);

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(row.symptoms).toBe(symptoms);
    expect(row.aiPreVisitStatus).toBe("RETRYING");

    await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ flag: "AI", enabled: false });
    setAiAdapter(new MockAiAdapter());
    await prisma.job.update({
      where: { id: job.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    await drainJobs();

    const retried = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(retried.status).toBe("COMPLETED");
    const recovered = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(recovered.status).toBe("BOOKED");
    expect(recovered.symptoms).toBe(symptoms);
    expect(recovered.aiPreVisitStatus).toBe("READY");
    setAiAdapter(createAiAdapter());
  });

  it("lets API-created email flags fail worker notifications until simulation is cleared", async () => {
    const toggle = await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ flag: "EMAIL", enabled: true });
    expect(toggle.status).toBe(200);

    const notification = await prisma.notification.create({
      data: {
        userId: patientId,
        appointmentId,
        type: "BOOKING_CONFIRMATION",
        status: "QUEUED",
        toEmail: "sim.pat@careflow.demo",
        subject: "Simulation email",
        body: "This should retry while the flag is on.",
        nextAttemptAt: new Date(Date.now() - 1000),
      },
    });

    await drainNotifications();
    const failed = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(failed.status).toBe("RETRYING");
    expect(failed.retryCount).toBe(1);

    await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ flag: "EMAIL", enabled: false });
    await prisma.notification.update({
      where: { id: notification.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await drainNotifications();

    const sent = await prisma.notification.findUniqueOrThrow({ where: { id: notification.id } });
    expect(sent.status).toBe("SENT");
    expect(sent.retryCount).toBe(1);
  });

  it("lets API-created calendar flags fail worker sync without invalidating the appointment", async () => {
    setCalendarAdapter(new MockCalendarAdapter());
    await prisma.user.update({
      where: { id: doctorUserId },
      data: {
        calendarConnected: true,
        googleRefreshToken: "sim-doctor-refresh",
        googleCalendarId: "primary",
      },
    });
    await prisma.user.update({
      where: { id: patientId },
      data: {
        calendarConnected: true,
        googleRefreshToken: "sim-patient-refresh",
        googleCalendarId: "primary",
      },
    });
    const toggle = await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ flag: "CALENDAR", enabled: true });
    expect(toggle.status).toBe(200);

    const job = await prisma.job.create({
      data: {
        type: "CALENDAR_SYNC",
        payload: { appointmentId, action: "create" },
      },
    });

    await drainJobs();
    const retrying = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(retrying.status).toBe("RETRYING");

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(row.calendarSyncStatus).toBe("RETRYING");
    expect(row.symptoms).toBe(symptoms);

    await request(app)
      .post("/api/demo/simulation")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ flag: "CALENDAR", enabled: false });
    await prisma.job.update({
      where: { id: job.id },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    await drainJobs();

    const syncedJob = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(syncedJob.status).toBe("COMPLETED");
    const synced = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(synced.status).toBe("BOOKED");
    expect(synced.calendarSyncStatus).toBe("SYNCED");
    setCalendarAdapter(createCalendarAdapter());
  });
});
