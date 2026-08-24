import { describe, expect, it } from "vitest";
import { MockAiAdapter } from "../src/services/ai.service.js";
import { TestEmailTransport } from "../src/services/email.service.js";
import { MockCalendarAdapter } from "../src/services/calendar.service.js";

describe("integration adapters", () => {
  it("validates structured mock AI output", async () => {
    const adapter = new MockAiAdapter();
    expect(adapter.configured).toBe(true);
    const briefing = JSON.parse(
      await adapter.completeJson({
        system: "You prepare a short pre-visit briefing for a clinician from patient-reported symptoms.",
        user: "headache",
      }),
    );
    expect(briefing.urgency).toBe("LOW");
    expect(briefing.chiefComplaint).toBeTruthy();
    expect(Array.isArray(briefing.keySymptoms)).toBe(true);
    expect(Array.isArray(briefing.suggestedQuestions)).toBe(true);
  });

  it("records test email without a live mailbox", async () => {
    const transport = new TestEmailTransport();
    const result = await transport.send({
      to: "patient@careflow.demo",
      subject: "Test",
      html: "Hello",
      text: "Hello",
    });
    expect(result.providerId).toMatch(/^test-/);
  });

  it("syncs calendar events through the mock adapter", async () => {
    const adapter = new MockCalendarAdapter();
    const eventId = await adapter.upsertEvent({
      eventId: null,
      summary: "Visit",
      description: "CareFlow",
      startAt: new Date(),
      endAt: new Date(),
      timeZone: "Asia/Kolkata",
      attendees: [],
      refreshToken: null,
    });
    expect(eventId).toMatch(/^mock-event-/);
    await adapter.deleteEvent({ eventId, refreshToken: null });
  });
});
