import { describe, expect, it } from "vitest";
import { clinicLocalToUtc } from "../src/utils/clinic-time.js";
import { nextMedicationFireAt, parseMedicationFrequency } from "../src/utils/medication-frequency.js";

const zone = "Asia/Kolkata";

describe("medication frequency parsing", () => {
  it("maps common doctor-supplied frequencies", () => {
    expect(parseMedicationFrequency("once daily")).toEqual({ kind: "times", hhmm: ["08:00"] });
    expect(parseMedicationFrequency("twice daily")).toEqual({ kind: "times", hhmm: ["08:00", "20:00"] });
    expect(parseMedicationFrequency("three times daily")).toEqual({
      kind: "times",
      hhmm: ["08:00", "14:00", "20:00"],
    });
    expect(parseMedicationFrequency("every 4 hours")).toEqual({ kind: "intervalHours", hours: 4 });
    expect(parseMedicationFrequency("every 6 hours")).toEqual({ kind: "intervalHours", hours: 6 });
    expect(parseMedicationFrequency("every 8 hours")).toEqual({ kind: "intervalHours", hours: 8 });
    expect(parseMedicationFrequency("every 12 hours")).toEqual({ kind: "intervalHours", hours: 12 });
    expect(parseMedicationFrequency("as needed")).toEqual({ kind: "prn" });
    expect(parseMedicationFrequency("PRN")).toEqual({ kind: "prn" });
  });

  it("does not schedule as-needed doses", () => {
    expect(nextMedicationFireAt("as needed", new Date(), zone)).toBeNull();
  });

  it("schedules the next clinic clock time for once/twice/three times daily", () => {
    const morning = clinicLocalToUtc("2026-08-24", "07:00", zone);
    expect(nextMedicationFireAt("once daily", morning, zone)).toEqual(clinicLocalToUtc("2026-08-24", "08:00", zone));
    expect(nextMedicationFireAt("twice daily", morning, zone)).toEqual(clinicLocalToUtc("2026-08-24", "08:00", zone));
    expect(nextMedicationFireAt("three times daily", clinicLocalToUtc("2026-08-24", "12:00", zone))).toEqual(
      clinicLocalToUtc("2026-08-24", "14:00", zone),
    );
  });

  it("advances interval frequencies by the stated hours", () => {
    const from = new Date("2026-08-24T04:00:00.000Z");
    expect(nextMedicationFireAt("every 4 hours", from, zone)?.toISOString()).toBe("2026-08-24T08:00:00.000Z");
    expect(nextMedicationFireAt("every 6 hours", from, zone)?.toISOString()).toBe("2026-08-24T10:00:00.000Z");
    expect(nextMedicationFireAt("every 8 hours", from, zone)?.toISOString()).toBe("2026-08-24T12:00:00.000Z");
    expect(nextMedicationFireAt("every 12 hours", from, zone)?.toISOString()).toBe("2026-08-24T16:00:00.000Z");
  });
});
