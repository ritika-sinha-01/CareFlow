import { describe, expect, it } from "vitest";
import { activeOccupancyKey } from "../src/utils/occupancy-key.js";

describe("occupancy key", () => {
  it("uses a stable UTC instant", () => {
    const start = new Date("2026-08-24T04:30:00.000Z");
    expect(activeOccupancyKey(start)).toBe("2026-08-24T04:30:00.000Z");
  });
});
