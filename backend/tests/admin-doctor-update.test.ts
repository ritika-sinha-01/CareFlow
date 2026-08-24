import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("admin doctor update", () => {
  let adminToken = "";
  let doctorToken = "";
  let patientToken = "";
  let doctorId = "";
  let doctorUserId = "";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;

    const admin = await prisma.user.create({
      data: {
        email: `admin.update.${suffix}@careflow.test`,
        passwordHash,
        role: "ADMIN",
        firstName: "Admin",
        lastName: "Updater",
      },
    });
    adminToken = (
      await request(app).post("/api/auth/login").send({ email: admin.email, password })
    ).body.data.token;

    const doctorUser = await prisma.user.create({
      data: {
        email: `doctor.update.${suffix}@careflow.test`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Editable",
        lastName: "Clinician",
      },
    });
    doctorUserId = doctorUser.id;
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "General Practice",
        slotDurationMin: 30,
        bio: "Original bio",
        workingHours: {
          create: [{ weekday: 1, startTime: "09:00", endTime: "17:00" }],
        },
      },
    });
    doctorId = doctor.id;
    doctorToken = (
      await request(app).post("/api/auth/login").send({ email: doctorUser.email, password })
    ).body.data.token;

    const patient = await request(app).post("/api/auth/register").send({
      email: `patient.update.${suffix}@careflow.test`,
      password,
      firstName: "Pat",
      lastName: "Ent",
    });
    patientToken = patient.body.data.token;
  });

  afterAll(async () => {
    if (doctorId) {
      await prisma.doctorWorkingHour.deleteMany({ where: { doctorId } });
      await prisma.doctor.deleteMany({ where: { id: doctorId } });
    }
    if (doctorUserId) await prisma.user.deleteMany({ where: { id: doctorUserId } });
  });

  it("rejects patient and doctor callers", async () => {
    const asPatient = await request(app)
      .patch(`/api/admin/doctors/${doctorId}`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ specialization: "Cardiology" });
    expect(asPatient.status).toBe(403);

    const asDoctor = await request(app)
      .patch(`/api/admin/doctors/${doctorId}`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ specialization: "Cardiology" });
    expect(asDoctor.status).toBe(403);
  });

  it("updates profile fields and working hours for an admin", async () => {
    const updated = await request(app)
      .patch(`/api/admin/doctors/${doctorId}`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        firstName: "Updated",
        lastName: "Name",
        specialization: "Cardiology",
        slotDurationMin: 20,
        yearsExperience: 7,
        bio: "Updated clinician bio",
        workingHours: [
          { weekday: 2, startTime: "10:00", endTime: "14:00" },
          { weekday: 4, startTime: "11:00", endTime: "16:00" },
        ],
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.user.firstName).toBe("Updated");
    expect(updated.body.data.specialization).toBe("Cardiology");
    expect(updated.body.data.slotDurationMin).toBe(20);
    expect(updated.body.data.yearsExperience).toBe(7);
    expect(updated.body.data.workingHours).toEqual([
      expect.objectContaining({ weekday: 2, startTime: "10:00", endTime: "14:00" }),
      expect.objectContaining({ weekday: 4, startTime: "11:00", endTime: "16:00" }),
    ]);

    const listed = await request(app).get("/api/doctors");
    const card = listed.body.data.find((row: { id: string }) => row.id === doctorId);
    expect(card.specialization).toBe("Cardiology");
    expect(card.slotDurationMin).toBe(20);
    expect(card.email).toBeUndefined();
  });
});
