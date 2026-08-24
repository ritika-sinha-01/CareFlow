import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import { processDueJobs } from "../src/services/job.service.js";
import { setAiAdapter, createAiAdapter, type AiCompletionAdapter } from "../src/services/ai.service.js";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";
import { nextClinicMonday } from "./helpers.js";

const app = createApp();
const CRON_SECRET = "test-cron-secret-test-cron-secret";

class FailingAiAdapter implements AiCompletionAdapter {
  name = "openai" as const;
  configured = true;
  async completeJson(): Promise<string> {
    throw new Error("provider unavailable");
  }
}

describe("worker tick", () => {
  let appointmentId = "";
  let doctorId = "";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("CareFlow!demo1", 4);
    const suffix = `${Date.now()}`;
    const slot = nextClinicMonday("15:30");
    const doctorUser = await prisma.user.create({
      data: {
        email: `tick.doc.${suffix}@careflow.test`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Tick",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: { userId: doctorUser.id, specialization: "General Practice" },
    });
    doctorId = doctor.id;
    const patient = await prisma.user.create({
      data: {
        email: `tick.pat.${suffix}@careflow.test`,
        passwordHash,
        role: "PATIENT",
        firstName: "Tick",
        lastName: "Patient",
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        doctorId: doctor.id,
        patientId: patient.id,
        startAt: slot,
        endAt: new Date(slot.getTime() + 30 * 60_000),
        status: "BOOKED",
        occupancyKey: activeOccupancyKey(slot),
        symptoms: "Worker tick must not change the booked visit.",
        aiPreVisitStatus: "PENDING",
      },
    });
    appointmentId = appointment.id;
  });

  afterAll(async () => {
    setAiAdapter(createAiAdapter());
    if (doctorId) await prisma.appointment.deleteMany({ where: { doctorId } });
  });

  it("rejects a missing or incorrect CRON_SECRET", async () => {
    const missing = await request(app).get("/api/internal/worker/tick");
    expect(missing.status).toBe(401);
    const wrong = await request(app)
      .get("/api/internal/worker/tick")
      .set("Authorization", "Bearer not-the-cron-secret");
    expect(wrong.status).toBe(401);
  });

  it("runs an authenticated tick and records a worker heartbeat", async () => {
    const response = await request(app)
      .get("/api/internal/worker/tick")
      .set("Authorization", `Bearer ${CRON_SECRET}`);
    expect(response.status).toBe(200);
    expect(response.body.data.ran).toBe(true);

    const health = await request(app).get("/api/health");
    const worker = health.body.data.components.find((item: { name: string }) => item.name === "BACKGROUND_WORKER");
    expect(worker.status).toBe("OPERATIONAL");
  });

  it("marks exhausted AI jobs FAILED without changing BOOKED", async () => {
    setAiAdapter(new FailingAiAdapter());
    await prisma.job.create({
      data: {
        type: "GENERATE_PRE_VISIT_AI",
        payload: { appointmentId },
        maxRetries: 1,
        availableAt: new Date(Date.now() - 1000),
      },
    });

    await processDueJobs();
    const jobs = await prisma.job.findMany({
      where: { type: "GENERATE_PRE_VISIT_AI" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const job = jobs.find((item) => (item.payload as { appointmentId?: string }).appointmentId === appointmentId);
    expect(job?.status).toBe("FAILED");

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.aiPreVisitStatus).toBe("FAILED");
  });
});
