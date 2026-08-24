import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db/prisma.js";
import {
  MockAiAdapter,
  createAiAdapter,
  generatePreVisitBriefing,
  setAiAdapter,
  type AiCompletionAdapter,
} from "../src/services/ai.service.js";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";
import { nextClinicMonday } from "./helpers.js";

class CountedQuestionAdapter implements AiCompletionAdapter {
  name = "mock" as const;
  configured = true;
  constructor(private readonly questions: string[]) {}
  async completeJson(): Promise<string> {
    return JSON.stringify({
      urgencyLevel: "Low",
      chiefComplaint: "Patient-reported symptoms for clinician review",
      suggestedQuestions: this.questions,
    });
  }
}

describe("pre-visit AI stores exactly three questions", () => {
  let appointmentId = "";
  let doctorId = "";

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash("CareFlow!demo1", 4);
    const suffix = `${Date.now()}`;
    const slot = nextClinicMonday("12:00");
    const doctorUser = await prisma.user.create({
      data: {
        email: `ai.q.doc.${suffix}@careflow.test`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Ai",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: { userId: doctorUser.id, specialization: "General Practice" },
    });
    doctorId = doctor.id;
    const patient = await prisma.user.create({
      data: {
        email: `ai.q.pat.${suffix}@careflow.test`,
        passwordHash,
        role: "PATIENT",
        firstName: "Ai",
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
        symptoms: "Mild headache for two days.",
      },
    });
    appointmentId = appointment.id;
  });

  afterAll(async () => {
    setAiAdapter(createAiAdapter());
    if (doctorId) await prisma.appointment.deleteMany({ where: { doctorId } });
  });

  it.each([
    { label: "0 questions", questions: [] as string[] },
    { label: "1 question", questions: ["How long has this lasted?"] },
    { label: "3 questions", questions: ["Q1?", "Q2?", "Q3?"] },
    { label: "4+ questions", questions: ["Q1?", "Q2?", "Q3?", "Q4?"] },
  ])("normalizes $label", async ({ questions }) => {
    setAiAdapter(new CountedQuestionAdapter(questions));
    await generatePreVisitBriefing(appointmentId);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(row.aiPreVisitStatus).toBe("READY");
    expect(row.aiSuggestedQuestions).toHaveLength(3);
  });

  it("does not crash booking state when the model returns invalid JSON", async () => {
    setAiAdapter({
      name: "mock",
      configured: true,
      async completeJson() {
        return "not-json";
      },
    });
    await expect(generatePreVisitBriefing(appointmentId)).rejects.toThrow();
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("BOOKED");
    expect(row.symptoms).toContain("headache");
    setAiAdapter(new MockAiAdapter());
  });
});
