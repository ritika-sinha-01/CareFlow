import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { PRODUCTION_DEMO_DOCTORS, seedProductionDemoDoctors } from "../scripts/seed-production-demo.js";
import { prisma } from "../src/db/prisma.js";
import { toClinicDateInput } from "../src/utils/clinic-time.js";
import { nextClinicMonday } from "./helpers.js";

const app = createApp();
const demoNames = PRODUCTION_DEMO_DOCTORS.map((doctor) => `${doctor.firstName} ${doctor.lastName}`);

describe("doctor list for evaluators", () => {
  it("returns seeded demo doctors on the public catalog", async () => {
    await seedProductionDemoDoctors(prisma);

    const response = await request(app).get("/api/doctors");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    const names = (response.body.data as Array<{ name: string; isDemo: boolean }>).map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(demoNames));
    expect(response.body.data.filter((row: { isDemo: boolean }) => row.isDemo).length).toBeGreaterThanOrEqual(6);
    for (const row of response.body.data as Array<Record<string, unknown>>) {
      expect(row.email).toBeUndefined();
      expect(row.passwordHash).toBeUndefined();
      expect(row.userId).toBeUndefined();
    }
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash/);
    const catalog = response.body.data as Array<{
      id: string;
      name: string;
      specialization: string;
      workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
    }>;
    const byName = new Map(PRODUCTION_DEMO_DOCTORS.map((doctor) => [`${doctor.firstName} ${doctor.lastName}`, doctor.specialization]));
    for (const [name, specialization] of byName) {
      const row = catalog.find((item) => item.name === name);
      expect(row?.specialization).toBe(specialization);
      expect(row?.workingHours).toHaveLength(5);
      expect(row?.workingHours.map((item) => item.weekday).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(row?.workingHours.every((item) => item.startTime === "09:00" && item.endTime === "17:00")).toBe(true);
    }

    const cardiology = catalog.find((row) => row.specialization === "Cardiology");
    expect(cardiology).toBeTruthy();
    const monday = nextClinicMonday("10:00");
    const registered = await request(app).post("/api/auth/register").send({
      email: `doctors.slots.${Date.now()}@careflow.test`,
      password: "CareFlow!demo1",
      firstName: "Slot",
      lastName: "Patient",
    });
    const slots = await request(app)
      .get(`/api/patient/doctors/${cardiology!.id}/slots?date=${toClinicDateInput(monday)}`)
      .set("Authorization", `Bearer ${registered.body.data.token}`);
    expect(slots.status).toBe(200);
    expect(slots.body.data.closed).toBe(false);
    expect(slots.body.data.slots.length).toBeGreaterThan(0);
    expect(slots.body.data.slots.some((slot: { state: string }) => slot.state === "AVAILABLE")).toBe(true);
  });

  it("keeps the patient directory authenticated while the public catalog stays open", async () => {
    const anonymous = await request(app).get("/api/patient/doctors");
    expect(anonymous.status).toBe(401);
  });

  it("returns the same demo doctors to an authenticated patient", async () => {
    await seedProductionDemoDoctors(prisma);
    const email = `doctors.list.${Date.now()}@careflow.test`;
    const registered = await request(app).post("/api/auth/register").send({
      email,
      password: "CareFlow!demo1",
      firstName: "List",
      lastName: "Patient",
    });
    expect(registered.status).toBe(201);

    const response = await request(app)
      .get("/api/patient/doctors")
      .set("Authorization", `Bearer ${registered.body.data.token}`);

    expect(response.status).toBe(200);
    const names = (response.body.data as Array<{ name: string }>).map((row) => row.name);
    expect(names).toEqual(expect.arrayContaining(demoNames));
  });
});
