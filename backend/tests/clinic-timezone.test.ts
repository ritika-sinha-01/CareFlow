import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  clinicLocalToUtc,
  clinicDayBounds,
  formatSlotLabel,
  toClinicDateInput,
  weekdayOf,
} from "../src/utils/clinic-time.js";
import { generateSlotStarts } from "../src/services/slot.service.js";

describe("clinic timezone", () => {
  it("converts Asia/Kolkata civil time to UTC", () => {
    const start = clinicLocalToUtc("2026-08-24", "09:00", "Asia/Kolkata");
    expect(start.toISOString()).toBe("2026-08-24T03:30:00.000Z");
    expect(toClinicDateInput(start, "Asia/Kolkata")).toBe("2026-08-24");
    expect(weekdayOf("2026-08-24", "Asia/Kolkata")).toBe(1);
  });

  it("converts America/New_York civil time to UTC during EDT", () => {
    const start = clinicLocalToUtc("2026-08-24", "09:00", "America/New_York");
    expect(start.toISOString()).toBe("2026-08-24T13:00:00.000Z");
    const slots = generateSlotStarts("2026-08-24", "09:00", "10:00", 30, "America/New_York");
    expect(slots[0]?.toISOString()).toBe("2026-08-24T13:00:00.000Z");
    expect(slots[1]?.toISOString()).toBe("2026-08-24T13:30:00.000Z");
  });

  it("keeps working-hour slot generation independent of machine local time", () => {
    const slots = generateSlotStarts("2026-08-24", "09:00", "12:00", 30, "Asia/Kolkata");
    expect(slots).toHaveLength(6);
    expect(formatSlotLabel(slots[0]!, "Asia/Kolkata")).toMatch(/9:00/i);
    expect(addCalendarDays("2026-08-24", 1)).toBe("2026-08-25");
  });

  it("bounds a clinic day in UTC", () => {
    const noonUtc = new Date("2026-08-24T06:30:00.000Z");
    const bounds = clinicDayBounds(noonUtc, "Asia/Kolkata");
    expect(bounds.dateStr).toBe("2026-08-24");
    expect(bounds.start.toISOString()).toBe("2026-08-23T18:30:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-08-24T18:30:00.000Z");
  });
});
