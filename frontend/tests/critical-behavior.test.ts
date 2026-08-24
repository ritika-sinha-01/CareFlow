import { describe, expect, it } from "vitest";
import {
  formatRemaining,
  isHoldExpired,
  remainingHoldSeconds,
  toDateInputValue,
} from "../src/lib/dates";
import { canAccessRoute } from "../src/lib/types";

describe("role-based route protection", () => {
  it("allows only matching roles", () => {
    expect(canAccessRoute("PATIENT", ["PATIENT"])).toBe(true);
    expect(canAccessRoute("DOCTOR", ["PATIENT"])).toBe(false);
    expect(canAccessRoute("ADMIN", ["ADMIN"])).toBe(true);
    expect(canAccessRoute(null, ["PATIENT"])).toBe(false);
  });
});

describe("booking hold countdown", () => {
  it("uses server holdExpiresAt rather than a local five-minute guess", () => {
    const expiresAt = "2026-08-24T10:05:00.000Z";
    expect(remainingHoldSeconds(expiresAt, Date.parse("2026-08-24T10:02:00.000Z"))).toBe(180);
    expect(formatRemaining(180)).toBe("3:00");
    expect(isHoldExpired(expiresAt, Date.parse("2026-08-24T10:05:00.000Z"))).toBe(true);
    expect(isHoldExpired(expiresAt, Date.parse("2026-08-24T10:04:59.000Z"))).toBe(false);
  });

  it("formats clinic calendar dates as YYYY-MM-DD", () => {
    expect(toDateInputValue(new Date("2026-08-24T03:30:00.000Z"), "Asia/Kolkata")).toBe("2026-08-24");
  });
});
