import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { deriveOverallStatus, getLiveness, type HealthComponent } from "../src/services/health.service.js";

function component(
  name: HealthComponent["name"],
  status: HealthComponent["status"],
  optional = false,
): HealthComponent {
  return { name, status, detail: status, optional };
}

describe("system health rollup", () => {
  it("is unavailable when the database is down", () => {
    const status = deriveOverallStatus([
      component("DATABASE", "UNAVAILABLE"),
      component("APPOINTMENT_ENGINE", "UNAVAILABLE"),
      component("AI_SERVICE", "UNAVAILABLE"),
      component("EMAIL_SERVICE", "UNAVAILABLE"),
      component("BACKGROUND_WORKER", "UNAVAILABLE"),
      component("GOOGLE_CALENDAR", "UNAVAILABLE", true),
    ]);
    expect(status).toBe("UNAVAILABLE");
  });

  it("does not fail the product when Google Calendar is unavailable", () => {
    const status = deriveOverallStatus([
      component("DATABASE", "OPERATIONAL"),
      component("APPOINTMENT_ENGINE", "OPERATIONAL"),
      component("AI_SERVICE", "OPERATIONAL"),
      component("EMAIL_SERVICE", "OPERATIONAL"),
      component("BACKGROUND_WORKER", "OPERATIONAL"),
      component("GOOGLE_CALENDAR", "UNAVAILABLE", true),
    ]);
    expect(status).toBe("OPERATIONAL");
  });

  it("is degraded when email is unconfigured", () => {
    const status = deriveOverallStatus([
      component("DATABASE", "OPERATIONAL"),
      component("APPOINTMENT_ENGINE", "OPERATIONAL"),
      component("AI_SERVICE", "UNAVAILABLE"),
      component("EMAIL_SERVICE", "UNAVAILABLE"),
      component("BACKGROUND_WORKER", "OPERATIONAL"),
      component("GOOGLE_CALENDAR", "UNAVAILABLE", true),
    ]);
    expect(status).toBe("DEGRADED");
  });
});

describe("liveness and readiness endpoints", () => {
  const app = createApp();

  it("reports liveness without depending on the worker or integrations", async () => {
    expect(getLiveness().status).toBe("OK");
    const response = await request(app).get("/api/health/live");
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("OK");
  });

  it("reports readiness from database and appointment engine only", async () => {
    const response = await request(app).get("/api/health/ready");
    expect([200, 503]).toContain(response.status);
    expect(response.body.data.components.map((item: { name: string }) => item.name)).toEqual([
      "DATABASE",
      "APPOINTMENT_ENGINE",
    ]);
    expect(response.body.data.components.some((item: { name: string }) => item.name === "BACKGROUND_WORKER")).toBe(
      false,
    );
  });
});
