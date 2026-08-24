import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, apiRequest, authErrorMessage } from "../src/lib/api";
import {
  formatRemaining,
  isHoldExpired,
  remainingHoldSeconds,
  toDateInputValue,
} from "../src/lib/dates";
import { isVercelPreviewHost } from "../src/lib/site";
import { canAccessRoute } from "../src/lib/types";

describe("production vs preview hosts", () => {
  it("treats hashed Vercel hosts as previews of the production app", () => {
    expect(isVercelPreviewHost("care-flow-frontend-eta.vercel.app")).toBe(false);
    expect(isVercelPreviewHost("care-flow-frontend-jlxtubygi-ritika-dev.vercel.app")).toBe(true);
    expect(isVercelPreviewHost("localhost")).toBe(false);
  });
});

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

describe("API error surfacing", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows backend error messages to the user", () => {
    expect(authErrorMessage(new ApiRequestError("CONFLICT", "An account with this email already exists.", 409), "Unable to create your account.")).toBe(
      "An account with this email already exists.",
    );
  });

  it("turns a failed fetch into a network error instead of a generic fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(apiRequest("/api/auth/register", { method: "POST", body: {} })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });
});
