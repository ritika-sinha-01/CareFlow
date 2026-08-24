import { describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../src/db/prisma.js";
import {
  assertProductionAdminPassword,
  assertProductionAdminSeedAllowed,
  isLocalDatabaseUrl,
  readProductionAdminSeedInput,
  seedProductionAdmin,
} from "../scripts/seed-production-admin.js";

describe("production admin seed guard", () => {
  it("refuses to run without ALLOW_PRODUCTION_ADMIN_SEED=true", () => {
    expect(() =>
      assertProductionAdminSeedAllowed({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/careflow",
        PRODUCTION_ADMIN_EMAIL: "admin@example.com",
        PRODUCTION_ADMIN_PASSWORD: "CareFlow!admin1",
      }),
    ).toThrow(/ALLOW_PRODUCTION_ADMIN_SEED=true/);
  });

  it("refuses to run when NODE_ENV is not production", () => {
    expect(() =>
      assertProductionAdminSeedAllowed({
        NODE_ENV: "development",
        ALLOW_PRODUCTION_ADMIN_SEED: "true",
        DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/careflow",
        PRODUCTION_ADMIN_EMAIL: "admin@example.com",
        PRODUCTION_ADMIN_PASSWORD: "CareFlow!admin1",
      }),
    ).toThrow(/NODE_ENV is not production/);
  });

  it("refuses localhost database URLs", () => {
    expect(isLocalDatabaseUrl("postgresql://careflow:careflow@127.0.0.1:54329/careflow")).toBe(true);
    expect(() =>
      assertProductionAdminSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_ADMIN_SEED: "true",
        DATABASE_URL: "postgresql://careflow:careflow@127.0.0.1:54329/careflow",
        PRODUCTION_ADMIN_EMAIL: "admin@example.com",
        PRODUCTION_ADMIN_PASSWORD: "CareFlow!admin1",
      }),
    ).toThrow(/localhost database/);
  });

  it("requires email and a strong password from the environment", () => {
    expect(() =>
      readProductionAdminSeedInput({
        PRODUCTION_ADMIN_EMAIL: "not-an-email",
        PRODUCTION_ADMIN_PASSWORD: "CareFlow!admin1",
      }),
    ).toThrow(/PRODUCTION_ADMIN_EMAIL/);
    expect(() => assertProductionAdminPassword("short")).toThrow(/10 characters/);
    expect(() =>
      readProductionAdminSeedInput({
        PRODUCTION_ADMIN_EMAIL: "admin@example.com",
        PRODUCTION_ADMIN_PASSWORD: "onlyletters",
      }),
    ).toThrow(/letter and a number/);
  });
});

describe("production admin upsert", () => {
  it("is idempotent and never hijacks a non-admin account", async () => {
    const email = `prod.admin.${Date.now()}@careflow.test`;
    const first = await seedProductionAdmin(prisma, {
      email,
      password: "CareFlow!admin1",
      firstName: "Clinic",
      lastName: "Admin",
    });
    expect(first.created).toBe(true);

    const second = await seedProductionAdmin(prisma, {
      email,
      password: "CareFlow!admin2",
      firstName: "Ops",
      lastName: "Lead",
    });
    expect(second.created).toBe(false);
    expect(second.updated).toBe(true);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.role).toBe("ADMIN");
    expect(user.firstName).toBe("Ops");
    expect(await bcrypt.compare("CareFlow!admin2", user.passwordHash)).toBe(true);
    expect(user.passwordHash).not.toContain("CareFlow!admin2");

    const patientEmail = `prod.patient.${Date.now()}@careflow.test`;
    await prisma.user.create({
      data: {
        email: patientEmail,
        passwordHash: await bcrypt.hash("CareFlow!demo1", 4),
        role: "PATIENT",
        firstName: "Existing",
        lastName: "Patient",
      },
    });
    const skipped = await seedProductionAdmin(prisma, {
      email: patientEmail,
      password: "CareFlow!admin1",
    });
    expect(skipped.skipped).toBe(true);
    const patient = await prisma.user.findUniqueOrThrow({ where: { email: patientEmail } });
    expect(patient.role).toBe("PATIENT");
  });
});
