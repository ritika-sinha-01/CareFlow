import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { expireStaleHolds } from "../src/services/hold-expiry.service.js";
import { generateSlotStarts } from "../src/services/slot.service.js";
import { resetSimulationFlags, setSimulationFlag } from "../src/services/demo-simulation.service.js";
import { nextClinicMonday } from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";

describe("slot generation", () => {
  it("builds 30-minute slots inside clinic-timezone working hours", () => {
    const starts = generateSlotStarts("2026-08-24", "09:00", "11:00", 30);
    expect(starts).toHaveLength(4);
    expect(starts[0]?.toISOString()).toBe("2026-08-24T03:30:00.000Z");
    expect(starts[3]?.toISOString()).toBe("2026-08-24T05:00:00.000Z");
  });
});

describe("appointment engine", () => {
  let doctorId = "";
  let patientA = "";
  let patientB = "";
  const slot = nextClinicMonday("10:00");
  const laterSlot = nextClinicMonday("10:30");

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;
    const doctorUser = await prisma.user.create({
      data: {
        email: `engine.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Engine",
        lastName: "Clinic",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "Engine Test",
        slotDurationMin: 30,
        workingHours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startTime: "09:00",
            endTime: "12:00",
          })),
        },
      },
    });
    doctorId = doctor.id;

    const register = async (label: string) => {
      const response = await request(app).post("/api/auth/register").send({
        email: `engine.${label}.${suffix}@careflow.demo`,
        password,
        firstName: label,
        lastName: "Patient",
      });
      expect(response.status).toBe(201);
      return response.body.data.token as string;
    };

    patientA = await register("A");
    patientB = await register("B");
  });

  afterAll(async () => {
    await resetSimulationFlags();
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
      await prisma.doctorLeave.deleteMany({ where: { doctorId } });
    }
  });

  it("lets only one of two simultaneous holds succeed", async () => {
    const [first, second] = await Promise.all([
      request(app)
        .post("/api/patient/holds")
        .set("Authorization", `Bearer ${patientA}`)
        .send({ doctorId, startAt: slot.toISOString() }),
      request(app)
        .post("/api/patient/holds")
        .set("Authorization", `Bearer ${patientB}`)
        .send({ doctorId, startAt: slot.toISOString() }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    const failed = first.status === 409 ? first : second;
    expect(failed.body.error.code).toBe("SLOT_UNAVAILABLE");
    const won = first.status === 201 ? first : second;
    const winnerToken = first.status === 201 ? patientA : patientB;
    await request(app)
      .post(`/api/patient/appointments/${won.body.data.id}/release`)
      .set("Authorization", `Bearer ${winnerToken}`);
  });

  it("rejects booking on a leave day", async () => {
    const dateStr = `${slot.getFullYear()}-${String(slot.getMonth() + 1).padStart(2, "0")}-${String(slot.getDate()).padStart(2, "0")}`;
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    await prisma.doctorLeave.create({
      data: {
        doctorId,
        startDate: date,
        endDate: date,
        reason: "Engine leave test",
      },
    });
    const response = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DOCTOR_ON_LEAVE");
    await prisma.doctorLeave.deleteMany({ where: { doctorId } });
  });

  it("releases an expired hold so another patient can book", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);

    await prisma.appointment.update({
      where: { id: held.body.data.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });
    await expireStaleHolds();

    const retry = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientB}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(retry.status).toBe(201);

    await request(app)
      .post(`/api/patient/appointments/${retry.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientB}`);
  });

  it("confirms, cancels, and frees the slot", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);

    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Persistent headache with afternoon dizziness." });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("BOOKED");
    expect(confirmed.body.data.symptoms).toContain("headache");

    const cancelled = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${patientA}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const free = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientB}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(free.status).toBe(201);
    await request(app)
      .post(`/api/patient/appointments/${free.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientB}`);
  });

  it("reschedules onto a free slot and leaves the old slot open", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Follow-up after the first visit notes." });
    expect(confirmed.status).toBe(200);

    const moved = await request(app)
      .post(`/api/patient/appointments/${confirmed.body.data.id}/reschedule`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ startAt: laterSlot.toISOString() });
    expect(moved.status).toBe(200);
    expect(new Date(moved.body.data.startAt).getTime()).toBe(laterSlot.getTime());

    const oldSlot = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientB}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(oldSlot.status).toBe(201);
    await request(app)
      .post(`/api/patient/appointments/${oldSlot.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientB}`);
    await request(app)
      .post(`/api/patient/appointments/${moved.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${patientA}`);
  });

  it("keeps the original visit when reschedule hits a taken slot", async () => {
    const blocked = nextClinicMonday("11:00");
    const blocker = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientB}`)
      .send({ doctorId, startAt: blocked.toISOString() });
    expect(blocker.status).toBe(201);
    await request(app)
      .post(`/api/patient/appointments/${blocker.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientB}`)
      .send({ symptoms: "Existing visit that occupies the target slot." });

    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Original visit that must survive a failed move." });
    expect(confirmed.status).toBe(200);

    const moved = await request(app)
      .post(`/api/patient/appointments/${confirmed.body.data.id}/reschedule`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ startAt: blocked.toISOString() });
    expect(moved.status).toBe(409);
    expect(moved.body.error.code).toBe("SLOT_UNAVAILABLE");

    const stillThere = await request(app)
      .get(`/api/patient/appointments/${confirmed.body.data.id}`)
      .set("Authorization", `Bearer ${patientA}`);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.data.status).toBe("BOOKED");
    expect(new Date(stillThere.body.data.startAt).getTime()).toBe(slot.getTime());

    await request(app)
      .post(`/api/patient/appointments/${confirmed.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${patientA}`);
    await request(app)
      .post(`/api/patient/appointments/${blocker.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${patientB}`);
  });

  it("does not book when booking-conflict simulation is on", async () => {
    await setSimulationFlag("BOOKING_CONFLICT", true);
    const response = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("SLOT_UNAVAILABLE");
    await resetSimulationFlags();
  });

  it("blocks confirmation of an expired hold without trusting the worker", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);

    await prisma.appointment.update({
      where: { id: held.body.data.id },
      data: { holdExpiresAt: new Date(Date.now() - 1000) },
    });

    const confirm = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Trying to confirm after the hold already expired." });
    expect(confirm.status).toBe(409);
    expect(confirm.body.error.code).toBe("HOLD_EXPIRED");

    const retry = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientB}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(retry.status).toBe(201);
    await request(app)
      .post(`/api/patient/appointments/${retry.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientB}`);
  });

  it("rejects confirming another patient's hold", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);

    const stolen = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientB}`)
      .send({ symptoms: "This hold is not mine to confirm." });
    expect(stolen.status).toBe(409);
    expect(stolen.body.error.code).toBe("HOLD_NOT_OWNED");

    await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientA}`);
  });

  it("hides another patient's appointment by id", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Visit used to prove patient isolation." });
    expect(confirmed.status).toBe(200);

    const hidden = await request(app)
      .get(`/api/patient/appointments/${confirmed.body.data.id}`)
      .set("Authorization", `Bearer ${patientB}`);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("APPOINTMENT_NOT_FOUND");

    await request(app)
      .post(`/api/patient/appointments/${confirmed.body.data.id}/cancel`)
      .set("Authorization", `Bearer ${patientA}`);
  });

  it("rejects confirming a cancelled hold", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientA}`);

    const confirm = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Cannot confirm after releasing this hold." });
    expect(confirm.status).toBe(409);
    expect(["HOLD_NOT_OWNED", "INVALID_APPOINTMENT_STATE"]).toContain(confirm.body.error.code);
  });

  it("treats hold-expired simulation as a failed confirm, not a booked visit", async () => {
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientA}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);
    await setSimulationFlag("HOLD_EXPIRED", true);
    const confirm = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientA}`)
      .send({ symptoms: "Simulation should block confirmation only." });
    expect(confirm.status).toBe(409);
    expect(confirm.body.error.code).toBe("HOLD_EXPIRED");
    await resetSimulationFlags();
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: held.body.data.id } });
    expect(row.status).toBe("HELD");
    await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/release`)
      .set("Authorization", `Bearer ${patientA}`);
  });
});
