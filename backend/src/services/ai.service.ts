import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { asStringArray } from "../utils/serializers.js";
import { shouldSimulate } from "./demo-simulation.service.js";
import { recordSystemEvent } from "./system-event.service.js";

const briefingSchema = z.object({
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
  chiefComplaint: z.string().trim().min(1).max(240),
  keySymptoms: z.array(z.string().trim().min(1)).max(8),
  suggestedQuestions: z.array(z.string().trim().min(1)).max(8),
});

const SYSTEM_PROMPT = `You prepare a short pre-visit briefing for a clinician from patient-reported symptoms.
Rules:
- This is NOT a diagnosis, treatment plan, or triage decision.
- Be conservative. Use HIGH urgency only for possible emergency warning signs (severe chest pain, difficulty breathing, sudden neurological symptoms, uncontrolled bleeding, or similar).
- Return JSON only with keys: urgency (LOW|MEDIUM|HIGH), chiefComplaint (one sentence), keySymptoms (string array), suggestedQuestions (string array of questions the clinician might ask).
- Do not invent facts that are not in the symptoms text.`;

const POST_VISIT_PROMPT = `You write a short, plain-language summary of a clinic visit for the patient.
Rules:
- This is NOT a diagnosis or a replacement for the clinician's advice.
- Use only the clinician notes and prescribed items. Do not invent findings, tests, or treatments.
- Keep the tone calm and specific.
- Return JSON only with keys: patientSummary (1-3 short paragraphs), followUpSteps (string array), medicationSchedule (array of { name, when }).`;

const postVisitSchema = z.object({
  patientSummary: z.string().trim().min(1).max(4000),
  followUpSteps: z.array(z.string().trim().min(1)).max(8),
  medicationSchedule: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        when: z.string().trim().min(1).max(160),
      }),
    )
    .max(12)
    .optional(),
});

type Briefing = z.infer<typeof briefingSchema>;

export type AiAdapterName = "openai" | "mock" | "unconfigured";

export interface AiCompletionAdapter {
  name: AiAdapterName;
  configured: boolean;
  completeJson(input: { system: string; user: string }): Promise<string>;
}

export class UnconfiguredAiAdapter implements AiCompletionAdapter {
  name = "unconfigured" as const;
  configured = false;

  async completeJson(): Promise<string> {
    throw new Error("AI provider is not configured.");
  }
}

export class MockAiAdapter implements AiCompletionAdapter {
  name = "mock" as const;
  configured = true;

  async completeJson(input: { system: string; user: string }): Promise<string> {
    if (input.system.includes("pre-visit briefing")) {
      return JSON.stringify({
        urgency: "LOW",
        chiefComplaint: "Patient-reported symptoms for clinician review",
        keySymptoms: ["As described by the patient"],
        suggestedQuestions: ["How long have these symptoms lasted?"],
      });
    }
    return JSON.stringify({
      patientSummary: "This is a mock visit summary for tests. It is not a diagnosis.",
      followUpSteps: ["Follow the clinician's written plan"],
      medicationSchedule: [],
    });
  }
}

export class OpenAiAdapter implements AiCompletionAdapter {
  name = "openai" as const;
  configured = true;

  constructor(private readonly apiKey: string) {}

  async completeJson(input: { system: string; user: string }): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error("AI provider rejected the request.");
    }

    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI provider returned an empty briefing.");
    return content;
  }
}

export function createAiAdapter(): AiCompletionAdapter {
  if (env.AI_PROVIDER === "mock") return new MockAiAdapter();
  if (env.OPENAI_API_KEY) return new OpenAiAdapter(env.OPENAI_API_KEY);
  return new UnconfiguredAiAdapter();
}

let aiAdapter: AiCompletionAdapter = createAiAdapter();

export function getAiAdapter(): AiCompletionAdapter {
  return aiAdapter;
}

export function setAiAdapter(adapter: AiCompletionAdapter): void {
  aiAdapter = adapter;
}

export function getAiConfigurationState(): { configured: boolean; provider: AiAdapterName } {
  return { configured: aiAdapter.configured, provider: aiAdapter.name };
}

export async function generatePreVisitBriefing(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true },
  });
  if (!appointment || appointment.status !== "BOOKED") return;

  const fail = async (message: string, retryable: boolean) => {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        aiPreVisitStatus: retryable ? "RETRYING" : "FAILED",
        aiPreVisitError: message,
      },
    });
    if (!retryable) {
      await prisma.appointmentTimelineEvent.create({
        data: {
          appointmentId: appointment.id,
          code: "AI_SUMMARY_FAILED",
          label: "Visit briefing unavailable",
        },
      });
    }
    await recordSystemEvent({
      type: "AI_REQUEST_FAILED",
      message,
      entityType: "appointment",
      entityId: appointment.id,
    });
    if (retryable) {
      throw new Error(message);
    }
  };

  if (await shouldSimulate("AI")) {
    await fail("Simulated AI failure. Original symptoms were preserved.", true);
    return;
  }

  if (!aiAdapter.configured) {
    await fail("Visit briefing is unavailable. Original symptoms were preserved.", false);
    return;
  }

  try {
    const content = await aiAdapter.completeJson({
      system: SYSTEM_PROMPT,
      user: `Clinician specialization: ${appointment.doctor.specialization}\nPatient-reported symptoms:\n${appointment.symptoms ?? "No symptoms were provided."}`,
    });
    const parsed = briefingSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error("AI provider returned an invalid briefing.");
    const briefing: Briefing = {
      ...parsed.data,
      keySymptoms: asStringArray(parsed.data.keySymptoms).slice(0, 8),
      suggestedQuestions: asStringArray(parsed.data.suggestedQuestions).slice(0, 8),
    };

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        aiPreVisitStatus: "READY",
        aiUrgency: briefing.urgency,
        aiChiefComplaint: briefing.chiefComplaint,
        aiKeySymptoms: briefing.keySymptoms,
        aiSuggestedQuestions: briefing.suggestedQuestions,
        aiPreVisitError: null,
        aiPreVisitGeneratedAt: new Date(),
      },
    });
    await prisma.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "AI_SUMMARY_GENERATED",
        label: "AI visit briefing generated",
      },
    });
    await recordSystemEvent({
      type: "AI_REQUEST_SUCCEEDED",
      message: "Pre-visit briefing generated.",
      entityType: "appointment",
      entityId: appointment.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visit briefing is unavailable.";
    if (message.includes("Original symptoms") || message.includes("Simulated AI")) {
      throw error;
    }
    await fail("The AI service did not return a briefing. Original symptoms were preserved.", true);
  }
}

export async function queuePreVisitRetry(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appointment || appointment.status !== "BOOKED") return;

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
}

export async function generatePostVisitSummary(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true, patient: true, prescriptions: true },
  });
  if (!appointment || (appointment.status !== "BOOKED" && appointment.status !== "COMPLETED") || !appointment.clinicalNotes) return;

  const fail = async (message: string, retryable: boolean) => {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        aiPostVisitStatus: retryable ? "RETRYING" : "FAILED",
        aiPostVisitError: message,
      },
    });
    await recordSystemEvent({
      type: "AI_REQUEST_FAILED",
      message,
      entityType: "appointment",
      entityId: appointment.id,
    });
    if (retryable) throw new Error(message);
  };

  if (await shouldSimulate("AI")) {
    await fail("Simulated AI failure. The visit notes were preserved.", true);
    return;
  }

  if (!aiAdapter.configured) {
    await fail("A patient summary is unavailable. Your clinician's notes and prescriptions still stand.", false);
    return;
  }

  try {
    const content = await aiAdapter.completeJson({
      system: POST_VISIT_PROMPT,
      user: [
        `Clinician notes:\n${appointment.clinicalNotes}`,
        appointment.prescriptions.length
          ? `Prescriptions:\n${JSON.stringify(appointment.prescriptions.map((row) => row.items))}`
          : "No prescription was issued.",
      ].join("\n\n"),
    });
    const parsed = postVisitSchema.safeParse(JSON.parse(content));
    if (!parsed.success) throw new Error("AI provider returned an invalid summary.");

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        aiPostVisitStatus: "READY",
        patientSummary: parsed.data.patientSummary,
        followUpSteps: parsed.data.followUpSteps,
        medicationSchedule: parsed.data.medicationSchedule ?? [],
        aiPostVisitError: null,
      },
    });
    await recordSystemEvent({
      type: "AI_REQUEST_SUCCEEDED",
      message: "Patient visit summary generated.",
      entityType: "appointment",
      entityId: appointment.id,
    });

    if (appointment.patient) {
      await prisma.notification.create({
        data: {
          userId: appointment.patient.id,
          appointmentId: appointment.id,
          type: "POST_VISIT_SUMMARY",
          status: "QUEUED",
          toEmail: appointment.patient.email,
          subject: "A summary of your CareFlow visit is ready",
          body: "Your clinician recorded this visit. The summary is for you and is not a diagnosis from CareFlow.",
        },
      }).catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Patient summary is unavailable.";
    if (message.includes("notes were preserved") || message.includes("still stand") || message.includes("Simulated AI")) {
      throw error;
    }
    await fail("The AI service did not return a patient summary. The visit notes were preserved.", true);
  }
}

export const aiPrompts = {
  preVisit: SYSTEM_PROMPT,
  postVisit: POST_VISIT_PROMPT,
};
