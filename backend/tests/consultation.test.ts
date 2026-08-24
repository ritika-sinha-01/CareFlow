import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { generatePostVisitSummary } from "../src/services/ai.service.js";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";
import { drainJobs, nextClinicMonday } from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("consultation workflow", () => {
  let doctorToken = "";
  let otherDoctorToken = "";
  let patientToken = "";
  let patientBToken = "";
  let appointmentId = "";
  let doctorUserId = "";
  let doctorId = "";
  let consultSlot = nextClinicMonday("13:00");

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;
    const slot = consultSlot;

    const doctorUser = await prisma.user.create({
      data: {
        email: `consult.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Consult",
        lastName: "Doctor",
      },
    });
    doctorUserId = doctorUser.id;
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
    consultSlot = slot;

    const otherUser = await prisma.user.create({
      data: {
        email: `consult.other.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Other",
        lastName: "Clinician",
      },
    });
    await prisma.doctor.create({ data: { userId: otherUser.id, specialization: "Dermatology" } });

    const patient = await request(app).post("/api/auth/register").send({
      email: `consult.pat.${suffix}@careflow.demo`,
      password,
      firstName: "Visit",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;

    const patientB = await request(app).post("/api/auth/register").send({
      email: `consult.patb.${suffix}@careflow.demo`,
      password,
      firstName: "Second",
      lastName: "Patient",
    });
    patientBToken = patientB.body.data.token;

    const created = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.body.data.user.id,
        startAt: slot,
        endAt: new Date(slot.getTime() + 30 * 60_000),
        status: "BOOKED",
        occupancyKey: activeOccupancyKey(slot),
        symptoms: "Dry cough and seasonal sneezing for one week.",
      },
    });
    appointmentId = created.id;

    doctorToken = (await request(app).post("/api/auth/login").send({
      email: doctorUser.email,
      password,
    })).body.data.token;
    otherDoctorToken = (await request(app).post("/api/auth/login").send({
      email: otherUser.email,
      password,
    })).body.data.token;
  });

  afterAll(async () => {
    if (doctorId) {
      await prisma.medicationReminder.deleteMany({ where: { appointment: { doctorId } } });
      await prisma.prescription.deleteMany({ where: { appointment: { doctorId } } });
      await prisma.appointment.deleteMany({ where: { doctorId } });
    }
    if (doctorUserId) {
      await prisma.doctor.deleteMany({ where: { userId: doctorUserId } });
    }
  });

  it("rejects patient and foreign-doctor writes", async () => {
    const asPatient = await request(app)
      .patch(`/api/doctor/appointments/${appointmentId}/notes`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ clinicalNotes: "Patient should not be able to write notes here." });
    expect(asPatient.status).toBe(403);

    const asOther = await request(app)
      .patch(`/api/doctor/appointments/${appointmentId}/notes`)
      .set("Authorization", `Bearer ${otherDoctorToken}`)
      .send({ clinicalNotes: "Another clinician should not see this visit." });
    expect(asOther.status).toBe(404);
  });

  it("saves notes that patients cannot read as clinical notes", async () => {
    const saved = await request(app)
      .patch(`/api/doctor/appointments/${appointmentId}/notes`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ clinicalNotes: "Allergic rhinitis likely. Antihistamine and review if cough persists." });
    expect(saved.status).toBe(200);
    expect(saved.body.data.clinicalNotes).toContain("Allergic rhinitis");

    const patientView = await request(app)
      .get(`/api/patient/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(patientView.status).toBe(200);
    expect(patientView.body.data.clinicalNotes).toBeUndefined();
  });

  it("issues a prescription and creates a medication reminder", async () => {
    const issued = await request(app)
      .post(`/api/doctor/appointments/${appointmentId}/prescriptions`)
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({
        items: [
          {
            name: "Loratadine",
            dosage: "10mg",
            frequency: "Once daily",
            duration: "14 days",
            instructions: "Take in the morning.",
          },
        ],
        notes: "Demo prescription — not medical advice.",
      });
    expect(issued.status).toBe(201);
    expect(issued.body.data.prescriptions[0].items[0].name).toBe("Loratadine");

    const reminders = await request(app)
      .get("/api/patient/medications")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(reminders.body.data.some((item: { medicationName: string }) => item.medicationName === "Loratadine")).toBe(true);

    const patientView = await request(app)
      .get(`/api/patient/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(patientView.body.data.prescriptions[0].items[0].name).toBe("Loratadine");
  });

  it("queues a post-visit summary without invalidating the visit when AI is unavailable", async () => {
    const completed = await request(app)
      .post(`/api/doctor/appointments/${appointmentId}/complete`)
      .set("Authorization", `Bearer ${doctorToken}`);
    expect(completed.status).toBe(200);
    expect(completed.body.data.postVisit.status).toBe("PENDING");

    await generatePostVisitSummary(appointmentId);
    await drainJobs();

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("COMPLETED");
    expect(row.occupancyKey).toBeNull();
    expect(row.clinicalNotes).toContain("Allergic rhinitis");
    expect(row.aiPostVisitStatus).toBe("FAILED");
  });

  it("frees the slot after completion so it can be booked again", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientBToken}`)
      .send({ doctorId, startAt: consultSlot.toISOString() });
    expect(held.status).toBe(201);

    const original = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(original.status).toBe("COMPLETED");
    expect(original.occupancyKey).toBeNull();
    expect(original.clinicalNotes).toContain("Allergic rhinitis");

    await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientBToken}`);
  });

  it("clears leftover occupancy keys on completed visits the way production backfill does", async () => {
    const later = nextClinicMonday("15:00");
    const leftover = await prisma.appointment.create({
      data: {
        doctorId,
        patientId: (await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } })).patientId!,
        startAt: later,
        endAt: new Date(later.getTime() + 30 * 60_000),
        status: "COMPLETED",
        occupancyKey: activeOccupancyKey(later),
        clinicalNotes: "Legacy completed visit that still held the occupancy key.",
      },
    });

    await prisma.appointment.updateMany({
      where: { doctorId, status: "COMPLETED", occupancyKey: { not: null } },
      data: { occupancyKey: null },
    });

    const cleared = await prisma.appointment.findUniqueOrThrow({ where: { id: leftover.id } });
    expect(cleared.status).toBe("COMPLETED");
    expect(cleared.occupancyKey).toBeNull();

    const booked = await prisma.appointment.findMany({
      where: { doctorId, status: "BOOKED" },
    });
    for (const row of booked) {
      expect(row.occupancyKey).not.toBeNull();
    }

    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientBToken}`)
      .send({ doctorId, startAt: later.toISOString() });
    expect(held.status).toBe(201);

    await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientBToken}`);
    await prisma.appointment.delete({ where: { id: leftover.id } }).catch(() => undefined);
  });
});
