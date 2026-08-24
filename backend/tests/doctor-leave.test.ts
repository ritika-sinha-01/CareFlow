import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";
import { clinicDateOf, nextClinicMonday } from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("doctor self-service leave", () => {
  let doctorId = "";
  let otherDoctorId = "";
  let doctorToken = "";
  let otherDoctorToken = "";
  let patientToken = "";
  let patientId = "";
  const slot = nextClinicMonday("13:00");

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;

    const doctorUser = await prisma.user.create({
      data: {
        email: `leave.doc.${suffix}@careflow.test`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Leave",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "General Practice",
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

    const otherUser = await prisma.user.create({
      data: {
        email: `leave.other.${suffix}@careflow.test`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Other",
        lastName: "Clinician",
      },
    });
    const other = await prisma.doctor.create({
      data: { userId: otherUser.id, specialization: "Dermatology" },
    });
    otherDoctorId = other.id;

    doctorToken = (
      await request(app).post("/api/auth/login").send({ email: doctorUser.email, password })
    ).body.data.token;
    otherDoctorToken = (
      await request(app).post("/api/auth/login").send({ email: otherUser.email, password })
    ).body.data.token;

    const patient = await request(app).post("/api/auth/register").send({
      email: `leave.pat.${suffix}@careflow.test`,
      password,
      firstName: "Leave",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;
    patientId = patient.body.data.user.id;

    await prisma.appointment.create({
      data: {
        doctorId,
        patientId,
        startAt: slot,
        endAt: new Date(slot.getTime() + 30 * 60_000),
        status: "BOOKED",
        occupancyKey: activeOccupancyKey(slot),
        symptoms: "Leave should detect this booked visit.",
      },
    });
  });

  afterAll(async () => {
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
      await prisma.doctorLeave.deleteMany({ where: { doctorId } });
    }
    if (otherDoctorId) {
      await prisma.doctorLeave.deleteMany({ where: { doctorId: otherDoctorId } });
    }
  });

  it("lets a doctor record own leave, detect overlaps, and notify both sides on resolve", async () => {
    const dateStr = clinicDateOf(slot);
    const created = await request(app)
      .post("/api/doctor/leave")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ startDate: dateStr, endDate: dateStr, reason: "Conference" });
    expect(created.status).toBe(201);
    expect(created.body.data.doctorId).toBe(doctorId);
    expect(created.body.data.affectedAppointments).toBeGreaterThanOrEqual(1);

    const listed = await request(app).get("/api/doctor/leave").set("Authorization", `Bearer ${doctorToken}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data.some((row: { id: string }) => row.id === created.body.data.id)).toBe(true);

    const otherResolve = await request(app)
      .post(`/api/doctor/leave/${created.body.data.id}/resolve`)
      .set("Authorization", `Bearer ${otherDoctorToken}`);
    expect(otherResolve.status).toBe(404);

    const resolved = await request(app)
      .post(`/api/doctor/leave/${created.body.data.id}/resolve`)
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.released).toBeGreaterThanOrEqual(1);

    const notices = await prisma.notification.findMany({
      where: { type: "LEAVE_AFFECTED", appointment: { doctorId } },
    });
    expect(notices.length).toBeGreaterThanOrEqual(2);
    expect(new Set(notices.map((item) => item.userId)).size).toBeGreaterThanOrEqual(2);

    const blocked = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("DOCTOR_ON_LEAVE");
  });

  it("rejects patient access to doctor leave routes", async () => {
    const listed = await request(app).get("/api/doctor/leave").set("Authorization", `Bearer ${patientToken}`);
    expect(listed.status).toBe(403);
    const created = await request(app)
      .post("/api/doctor/leave")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ startDate: "2026-08-24", endDate: "2026-08-24" });
    expect(created.status).toBe(403);
  });
});
