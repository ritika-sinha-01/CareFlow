import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "../src/services/appointment-state.js";

describe("appointment lifecycle", () => {
  it("allows the documented transitions and blocks the rest", () => {
    expect(canTransition("HELD", "BOOKED")).toBe(true);
    expect(canTransition("HELD", "EXPIRED")).toBe(true);
    expect(canTransition("HELD", "CANCELLED")).toBe(true);
    expect(canTransition("BOOKED", "CANCELLED")).toBe(true);
    expect(canTransition("BOOKED", "COMPLETED")).toBe(true);
    expect(canTransition("EXPIRED", "BOOKED")).toBe(false);
    expect(canTransition("CANCELLED", "BOOKED")).toBe(false);
    expect(canTransition("COMPLETED", "CANCELLED")).toBe(false);
    expect(() => assertTransition("EXPIRED", "BOOKED")).toThrow(/cannot move/);
  });
});
