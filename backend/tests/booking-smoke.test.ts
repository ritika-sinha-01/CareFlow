import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { nextClinicMonday } from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("end-to-end booking smoke", () => {
  let doctorId = "";
  let doctorToken = "";
  let patientToken = "";
  const slot = nextClinicMonday("10:00");

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;

    const doctorUser = await prisma.user.create({
      data: {
        email: `smoke.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Smoke",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "General Practice",
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
    const doctorLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: doctorUser.email, password });
    doctorToken = doctorLogin.body.data.token;

    const patient = await request(app).post("/api/auth/register").send({
      email: `smoke.pat.${suffix}@careflow.demo`,
      password,
      firstName: "Smoke",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;
  });

  afterAll(async () => {
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
    }
  });

  it("logs in, holds a slot, confirms symptoms, and shows the visit to both sides", async () => {
    const doctors = await request(app)
      .get("/api/patient/doctors")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(doctors.status).toBe(200);
    expect(doctors.body.data.some((row: { id: string }) => row.id === doctorId)).toBe(true);

    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);
    expect(held.body.data.status).toBe("HELD");
    expect(held.body.data.holdExpiresAt).toBeTruthy();

    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ symptoms: "Occasional headache after long days at a screen." });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("BOOKED");

    const patientView = await request(app)
      .get(`/api/patient/appointments/${confirmed.body.data.id}`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(patientView.status).toBe(200);
    expect(patientView.body.data.status).toBe("BOOKED");
    expect(patientView.body.data.symptoms).toContain("headache");

    const doctorView = await request(app)
      .get(`/api/doctor/appointments/${confirmed.body.data.id}`)
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(doctorView.status).toBe(200);
    expect(doctorView.body.data.status).toBe("BOOKED");

    const row = await prisma.appointment.findUniqueOrThrow({
      where: { id: confirmed.body.data.id },
      include: { timeline: true, notifications: true },
    });
    expect(row.status).toBe("BOOKED");
    expect(row.timeline.some((event) => event.code === "APPOINTMENT_CONFIRMED")).toBe(true);

    const queuedMail = await prisma.notification.findMany({
      where: { appointmentId: row.id, status: { in: ["QUEUED", "RETRYING", "SENT"] } },
    });
    expect(queuedMail.some((item) => item.type === "BOOKING_CONFIRMATION")).toBe(true);
    expect(queuedMail.some((item) => item.type === "APPOINTMENT_REMINDER")).toBe(true);

    const jobs = await prisma.job.findMany({
      where: {
        type: { in: ["GENERATE_PRE_VISIT_AI", "CALENDAR_SYNC"] },
        status: { in: ["QUEUED", "RETRYING", "COMPLETED", "FAILED"] },
      },
    });
    expect(jobs.some((job) => JSON.stringify(job.payload).includes(row.id))).toBe(true);
  });
});
