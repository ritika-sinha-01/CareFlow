import { describe, expect, it } from "vitest";
import { deriveOverallStatus, type HealthComponent } from "../src/services/health.service.js";

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
