import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma.js";
import {
  assertProductionDemoSeedAllowed,
  isLocalDatabaseUrl,
  PRODUCTION_DEMO_DOCTORS,
  seedProductionDemoDoctors,
} from "../scripts/seed-production-demo.js";

describe("production demo seed guard", () => {
  it("refuses to run without ALLOW_PRODUCTION_DEMO_SEED=true", () => {
    expect(() =>
      assertProductionDemoSeedAllowed({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/careflow",
      }),
    ).toThrow(/ALLOW_PRODUCTION_DEMO_SEED=true/);
  });

  it("refuses to run when NODE_ENV is not production", () => {
    expect(() =>
      assertProductionDemoSeedAllowed({
        NODE_ENV: "development",
        ALLOW_PRODUCTION_DEMO_SEED: "true",
        DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/careflow",
      }),
    ).toThrow(/NODE_ENV is not production/);
  });

  it("refuses localhost database URLs", () => {
    expect(isLocalDatabaseUrl("postgresql://careflow:careflow@127.0.0.1:54329/careflow")).toBe(true);
    expect(() =>
      assertProductionDemoSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_DEMO_SEED: "true",
        DATABASE_URL: "postgresql://careflow:careflow@127.0.0.1:54329/careflow",
      }),
    ).toThrow(/localhost database/);
  });

  it("allows an explicit production Neon target", () => {
    expect(() =>
      assertProductionDemoSeedAllowed({
        NODE_ENV: "production",
        ALLOW_PRODUCTION_DEMO_SEED: "true",
        DATABASE_URL: "postgresql://user:pass@ep-example.neon.tech/careflow?sslmode=require",
      }),
    ).not.toThrow();
  });
});

describe("production demo doctor upsert", () => {
  it("is idempotent and does not duplicate doctors or weekday hours", async () => {
    const first = await seedProductionDemoDoctors(prisma);
    const second = await seedProductionDemoDoctors(prisma);

    expect(first.doctorsCreated + first.doctorsAlreadyExisting).toBe(PRODUCTION_DEMO_DOCTORS.length);
    expect(second.doctorsCreated).toBe(0);
    expect(second.doctorsAlreadyExisting).toBe(PRODUCTION_DEMO_DOCTORS.length);
    expect(second.workingHoursCreated).toBe(0);
    expect(second.workingHoursAlreadyExisting).toBe(PRODUCTION_DEMO_DOCTORS.length * 5);

    const emails = PRODUCTION_DEMO_DOCTORS.map((doctor) => doctor.email);
    const users = await prisma.user.findMany({
      where: { email: { in: [...emails] } },
      include: { doctor: { include: { workingHours: true } } },
    });
    expect(users).toHaveLength(PRODUCTION_DEMO_DOCTORS.length);
    for (const user of users) {
      expect(user.role).toBe("DOCTOR");
      expect(user.isDemo).toBe(true);
      expect(user.doctor?.isDemo).toBe(true);
      expect(user.doctor?.workingHours.map((item) => item.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });
});
