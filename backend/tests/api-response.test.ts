import { describe, expect, it } from "vitest";
import { apiError, apiSuccess } from "../src/utils/api-response.js";

describe("API envelope", () => {
  it("returns a success payload", () => {
    expect(apiSuccess({ id: "1" })).toEqual({ success: true, data: { id: "1" } });
  });

  it("returns a human-readable error payload", () => {
    expect(apiError("SLOT_UNAVAILABLE", "This appointment slot is no longer available.")).toEqual({
      success: false,
      error: {
        code: "SLOT_UNAVAILABLE",
        message: "This appointment slot is no longer available.",
      },
    });
  });
});
