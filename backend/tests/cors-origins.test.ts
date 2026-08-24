import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { isAllowedCorsOrigin, normalizeOrigin, parseAllowedOrigins } from "../src/config/cors-origins.js";

describe("CORS origin allowlist", () => {
  it("normalizes trailing slashes and wrapping quotes", () => {
    expect(normalizeOrigin(" https://care-flow-frontend-eta.vercel.app/ ")).toBe(
      "https://care-flow-frontend-eta.vercel.app",
    );
    expect(normalizeOrigin('"https://care-flow-frontend-eta.vercel.app"')).toBe(
      "https://care-flow-frontend-eta.vercel.app",
    );
  });

  it("includes FRONTEND_URL even when CORS_ORIGIN is a different host", () => {
    const allowed = parseAllowedOrigins(
      "https://careflow-backend-six.vercel.app",
      "https://care-flow-frontend-eta.vercel.app/",
    );
    expect(
      isAllowedCorsOrigin("https://care-flow-frontend-eta.vercel.app", allowed, false),
    ).toBe(true);
    expect(isAllowedCorsOrigin("https://evil.example", allowed, false)).toBe(false);
  });

  it("does not use a wildcard origin", () => {
    const allowed = parseAllowedOrigins(
      "https://care-flow-frontend-eta.vercel.app",
      "https://care-flow-frontend-eta.vercel.app",
    );
    expect(allowed.has("*")).toBe(false);
  });
});

describe("CORS preflight for auth routes", () => {
  const app = createApp();
  const frontend = "http://localhost:5173";

  it("reflects the allowed frontend origin on OPTIONS /api/auth/register", async () => {
    const response = await request(app)
      .options("/api/auth/register")
      .set("Origin", frontend)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");

    expect(response.status).toBeLessThan(300);
    expect(response.headers["access-control-allow-origin"]).toBe(frontend);
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toMatch(/POST/);
  });

  it("sets Cross-Origin-Resource-Policy so a separate SPA can read JSON", async () => {
    const response = await request(app).get("/api/health/live").set("Origin", frontend);
    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(frontend);
    expect(response.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });
});
