import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";

const app = createApp();

async function login(email: string, password = "CareFlow!demo1") {
  const response = await request(app).post("/api/auth/login").send({ email, password });
  expect(response.status).toBe(200);
  return response.body.data.token as string;
}

describe("auth", () => {
  it("registers a patient and returns a session", async () => {
    const email = `phase2.${Date.now()}@careflow.demo`;
    const response = await request(app).post("/api/auth/register").send({
      email,
      password: "CareFlow!demo1",
      firstName: "Nisha",
      lastName: "Verma",
    });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.user.role).toBe("PATIENT");
    expect(response.body.data.user.email).toBe(email);
    expect(response.body.data.token).toBeTruthy();
    expect(response.body.data.user.passwordHash).toBeUndefined();
  });

  it("rejects duplicate emails", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: "aarav.gupta@careflow.demo",
      password: "CareFlow!demo1",
      firstName: "Aarav",
      lastName: "Gupta",
    });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("CONFLICT");
  });

  it("rejects invalid credentials without leaking which field failed", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({ email: "aarav.gupta@careflow.demo", password: "wrong-password-1" });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("authorization isolation", () => {
  it("prevents a patient from reading another patient's appointment", async () => {
    const aarav = await login("aarav.gupta@careflow.demo");
    const mine = await request(app)
      .get("/api/patient/appointments")
      .set("Authorization", `Bearer ${aarav}`);
    expect(mine.status).toBe(200);
    const appointmentId = mine.body.data[0]?.id as string;
    expect(appointmentId).toBeTruthy();

    const meera = await login("meera.iyer@careflow.demo");
    const forbidden = await request(app)
      .get(`/api/patient/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${meera}`);
    expect(forbidden.status).toBe(404);
    expect(forbidden.body.error.code).toBe("NOT_FOUND");
  });

  it("prevents a doctor from reading another doctor's appointment", async () => {
    const cardiology = await login("ananya.sharma@careflow.demo");
    const list = await request(app)
      .get("/api/doctor/appointments")
      .set("Authorization", `Bearer ${cardiology}`);
    const appointmentId = list.body.data[0]?.id as string;
    expect(appointmentId).toBeTruthy();

    const dermatology = await login("rohan.mehta@careflow.demo");
    const forbidden = await request(app)
      .get(`/api/doctor/appointments/${appointmentId}`)
      .set("Authorization", `Bearer ${dermatology}`);
    expect(forbidden.status).toBe(404);
  });

  it("rejects a patient calling a doctor route", async () => {
    const token = await login("aarav.gupta@careflow.demo");
    const response = await request(app)
      .get("/api/doctor/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a doctor calling an admin route", async () => {
    const token = await login("ananya.sharma@careflow.demo");
    const response = await request(app)
      .get("/api/admin/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(403);
  });

  it("allows admin to read an appointment by id", async () => {
    const appointment = await prisma.appointment.findFirst({ where: { status: "BOOKED" } });
    expect(appointment).toBeTruthy();
    const token = await login("admin@careflow.demo");
    const response = await request(app)
      .get(`/api/admin/appointments/${appointment!.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(appointment!.id);
  });
});
