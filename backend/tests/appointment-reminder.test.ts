import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { drainNotifications, nextClinicMonday } from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("appointment reminders", () => {
  let doctorId = "";
  let doctorUserId = "";
  let doctorEmail = "";
  let patientToken = "";
  let patientId = "";
  let patientEmail = "";
  const slot = nextClinicMonday("11:30");
  const later = nextClinicMonday("16:00");

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;
    const doctorUser = await prisma.user.create({
      data: {
        email: `remind.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Remind",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "Reminders",
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
    doctorEmail = doctorUser.email;

    const patient = await request(app).post("/api/auth/register").send({
      email: `remind.pat.${suffix}@careflow.demo`,
      password,
      firstName: "Remind",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;
    patientId = patient.body.data.user.id;
    patientEmail = patient.body.data.user.email;
  });

  afterAll(async () => {
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
    }
  });

  it("queues a reminder on confirm without blocking booking, and skips duplicates", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);

    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ symptoms: "Reminder flow should not delay confirmation." });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("BOOKED");

    const reminders = await prisma.notification.findMany({
      where: { appointmentId: confirmed.body.data.id, type: "APPOINTMENT_REMINDER" },
    });
    expect(reminders).toHaveLength(2);
    expect(new Set(reminders.map((item) => item.userId))).toEqual(new Set([patientId, doctorUserId]));
    expect(reminders.every((item) => item.status === "QUEUED")).toBe(true);
    expect(reminders.every((item) => item.nextAttemptAt.getTime() > Date.now())).toBe(true);

    const confirmations = await prisma.notification.findMany({
      where: { appointmentId: confirmed.body.data.id, type: "BOOKING_CONFIRMATION" },
    });
    expect(confirmations).toHaveLength(2);
    expect(new Set(confirmations.map((item) => item.toEmail))).toEqual(new Set([patientEmail, doctorEmail]));
    expect(confirmations.every((item) => item.status === "QUEUED")).toBe(true);
  });

  it("updates the reminder when the visit is rescheduled", async () => {
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { doctorId, patientId, status: "BOOKED", startAt: slot },
    });
    const moved = await request(app)
      .post(`/api/patient/appointments/${appointment.id}/reschedule`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ startAt: later.toISOString() });
    expect(moved.status).toBe(200);

    const reminders = await prisma.notification.findMany({
      where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
    });
    expect(reminders).toHaveLength(2);
    expect(reminders.every((item) => item.status === "QUEUED")).toBe(true);
    const expected = later.getTime() - 24 * 60 * 60 * 1000;
    for (const reminder of reminders) {
      expect(Math.abs(reminder.nextAttemptAt.getTime() - expected)).toBeLessThan(2000);
    }
  });

  it("invalidates the reminder on cancel and does not send it", async () => {
    const appointment = await prisma.appointment.findFirstOrThrow({
      where: { doctorId, patientId, status: "BOOKED" },
    });
    const cancelled = await request(app)
      .post(`/api/patient/appointments/${appointment.id}/cancel`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(cancelled.status).toBe(200);

    const reminders = await prisma.notification.findMany({
      where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
    });
    expect(reminders).toHaveLength(2);
    expect(reminders.every((item) => item.status === "FAILED")).toBe(true);
    expect(reminders.every((item) => /no longer booked/i.test(item.lastError ?? ""))).toBe(true);

    await prisma.notification.updateMany({
      where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
      data: { status: "QUEUED", nextAttemptAt: new Date(Date.now() - 1000) },
    });
    await drainNotifications();
    const skipped = await prisma.notification.findMany({
      where: { appointmentId: appointment.id, type: "APPOINTMENT_REMINDER" },
    });
    expect(skipped.every((item) => item.status === "FAILED")).toBe(true);
    expect(skipped.every((item) => item.sentAt === null)).toBe(true);
  });
});
