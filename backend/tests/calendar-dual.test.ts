import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/db/prisma.js";
import {
  MockCalendarAdapter,
  createCalendarAdapter,
  setCalendarAdapter,
  syncAppointmentCalendar,
} from "../src/services/calendar.service.js";
import { resetSimulationFlags, setSimulationFlag } from "../src/services/demo-simulation.service.js";
import {
  clinicDateOf,
  drainJobs,
  nextClinicMonday,
  setUserCalendarConnected,
} from "./helpers.js";

const app = createApp();
const password = "CareFlow!demo1";
const symptoms = "Sensitive clinical symptom: nocturnal dyspnea with chest pain.";

describe("dual patient and doctor Google Calendar sync", () => {
  let doctorId = "";
  let doctorUserId = "";
  let doctorToken = "";
  let patientId = "";
  let patientToken = "";
  let otherPatientToken = "";
  let otherDoctorToken = "";
  let adminToken = "";
  let adapter = new MockCalendarAdapter();
  let slotIndex = 0;

  function nextSlot() {
    const startMinutes = 9 * 60 + slotIndex * 30;
    slotIndex += 1;
    const hour = Math.floor(startMinutes / 60);
    const minute = startMinutes % 60;
    return nextClinicMonday(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  async function confirmVisit() {
    const slot = nextSlot();
    const held = await request(app)
      .post("/api/patient/holds")
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ doctorId, startAt: slot.toISOString() });
    expect(held.status).toBe(201);
    const confirmed = await request(app)
      .post(`/api/patient/appointments/${held.body.data.id}/confirm`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ symptoms });
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.status).toBe("BOOKED");
    return confirmed.body.data.id as string;
  }

  async function participantRows(appointmentId: string) {
    return prisma.appointmentCalendarEvent.findMany({
      where: { appointmentId },
      include: { owner: { select: { id: true, role: true } } },
    });
  }

  function rowFor(rows: Awaited<ReturnType<typeof participantRows>>, userId: string) {
    return rows.find((row) => row.ownerUserId === userId);
  }

  beforeAll(async () => {
    await resetSimulationFlags();
    const passwordHash = await bcrypt.hash(password, 4);
    const suffix = `${Date.now()}`;

    const admin = await prisma.user.create({
      data: {
        email: `cal.admin.${suffix}@careflow.demo`,
        passwordHash,
        role: "ADMIN",
        firstName: "Cal",
        lastName: "Admin",
      },
    });
    adminToken = (await request(app).post("/api/auth/login").send({ email: admin.email, password })).body.data.token;

    const doctorUser = await prisma.user.create({
      data: {
        email: `cal.doc.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Cal",
        lastName: "Doctor",
      },
    });
    const doctor = await prisma.doctor.create({
      data: {
        userId: doctorUser.id,
        specialization: "Calendar Medicine",
        slotDurationMin: 30,
        workingHours: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({
            weekday,
            startTime: "09:00",
            endTime: "17:00",
          })),
        },
      },
    });
    doctorId = doctor.id;
    doctorUserId = doctorUser.id;
    doctorToken = (await request(app).post("/api/auth/login").send({ email: doctorUser.email, password })).body.data
      .token;

    const otherDoctorUser = await prisma.user.create({
      data: {
        email: `cal.doc2.${suffix}@careflow.demo`,
        passwordHash,
        role: "DOCTOR",
        firstName: "Other",
        lastName: "Clinician",
      },
    });
    await prisma.doctor.create({
      data: {
        userId: otherDoctorUser.id,
        specialization: "Other",
        slotDurationMin: 30,
      },
    });
    otherDoctorToken = (
      await request(app).post("/api/auth/login").send({ email: otherDoctorUser.email, password })
    ).body.data.token;

    const patient = await request(app).post("/api/auth/register").send({
      email: `cal.pat.${suffix}@careflow.demo`,
      password,
      firstName: "Cal",
      lastName: "Patient",
    });
    patientToken = patient.body.data.token;
    patientId = patient.body.data.user.id;

    const otherPatient = await request(app).post("/api/auth/register").send({
      email: `cal.pat2.${suffix}@careflow.demo`,
      password,
      firstName: "Other",
      lastName: "Patient",
    });
    otherPatientToken = otherPatient.body.data.token;
  });

  beforeEach(async () => {
    await resetSimulationFlags();
    await prisma.job.deleteMany();
    await prisma.doctorLeave.deleteMany({ where: { doctorId } });
    adapter = new MockCalendarAdapter();
    setCalendarAdapter(adapter);
    await setUserCalendarConnected(doctorUserId, false);
    await setUserCalendarConnected(patientId, false);
  });

  afterAll(async () => {
    await resetSimulationFlags();
    setCalendarAdapter(createCalendarAdapter());
    if (doctorId) {
      await prisma.appointment.deleteMany({ where: { doctorId } });
      await prisma.doctorLeave.deleteMany({ where: { doctorId } });
      await prisma.doctor.deleteMany({ where: { id: doctorId } });
    }
  });

  it("creates a doctor calendar event when only the doctor is connected", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    const rows = await participantRows(appointmentId);
    const doctorRow = rowFor(rows, doctorUserId);
    const patientRow = rowFor(rows, patientId);
    expect(doctorRow?.syncStatus).toBe("SYNCED");
    expect(doctorRow?.googleEventId).toMatch(/^mock-event-/);
    expect(patientRow?.syncStatus).toBe("NOT_CONNECTED");
    expect(patientRow?.googleEventId).toBeNull();
    expect(adapter.createCount).toBe(1);
    const event = adapter.events.get(doctorRow!.googleEventId!);
    expect(event?.summary).toContain("Cal Patient");
    expect(event?.description).not.toContain("dyspnea");
    expect(event?.description).not.toContain(symptoms);
  });

  it("creates a patient calendar event when only the patient is connected", async () => {
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    const rows = await participantRows(appointmentId);
    expect(rowFor(rows, patientId)?.syncStatus).toBe("SYNCED");
    expect(rowFor(rows, doctorUserId)?.syncStatus).toBe("NOT_CONNECTED");
    expect(adapter.createCount).toBe(1);
    const event = adapter.events.get(rowFor(rows, patientId)!.googleEventId!);
    expect(event?.summary).toContain("Cal Doctor");
    expect(event?.description).toContain("Calendar Medicine");
    expect(event?.description).not.toContain("dyspnea");
  });

  it("creates both calendar events when doctor and patient are connected", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();

    const rows = await participantRows(appointmentId);
    expect(rowFor(rows, doctorUserId)?.syncStatus).toBe("SYNCED");
    expect(rowFor(rows, patientId)?.syncStatus).toBe("SYNCED");
    expect(adapter.createCount).toBe(2);
    expect(adapter.events.size).toBe(2);
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.calendarSyncStatus).toBe("SYNCED");
  });

  it("keeps the appointment BOOKED when neither participant is connected", async () => {
    const appointmentId = await confirmVisit();
    await drainJobs();
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.symptoms).toBe(symptoms);
    const rows = await participantRows(appointmentId);
    expect(rowFor(rows, doctorUserId)?.syncStatus).toBe("NOT_CONNECTED");
    expect(rowFor(rows, patientId)?.syncStatus).toBe("NOT_CONNECTED");
    expect(adapter.createCount).toBe(0);
  });

  it("keeps the appointment BOOKED when the doctor calendar job fails", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    await setSimulationFlag("CALENDAR_DOCTOR", true);
    const appointmentId = await confirmVisit();
    await drainJobs();

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.symptoms).toBe(symptoms);
    const rows = await participantRows(appointmentId);
    expect(rowFor(rows, doctorUserId)?.syncStatus).toBe("RETRYING");
    expect(rowFor(rows, patientId)?.syncStatus).toBe("SYNCED");
  });

  it("keeps the appointment BOOKED when the patient calendar job fails", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    await setSimulationFlag("CALENDAR_PATIENT", true);
    const appointmentId = await confirmVisit();
    await drainJobs();

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.symptoms).toBe(symptoms);
    const rows = await participantRows(appointmentId);
    expect(rowFor(rows, patientId)?.syncStatus).toBe("RETRYING");
    expect(rowFor(rows, doctorUserId)?.syncStatus).toBe("SYNCED");
  });

  it("keeps the appointment BOOKED when both calendar jobs fail", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    await setSimulationFlag("CALENDAR", true);
    const appointmentId = await confirmVisit();
    await drainJobs();

    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.symptoms).toBe(symptoms);
    expect(appointment.calendarSyncStatus).toBe("RETRYING");
    const rows = await participantRows(appointmentId);
    expect(rowFor(rows, doctorUserId)?.syncStatus).toBe("RETRYING");
    expect(rowFor(rows, patientId)?.syncStatus).toBe("RETRYING");
    expect(adapter.createCount).toBe(0);
  });

  it("creates a missing event on retry instead of failing permanently", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();
    const before = await participantRows(appointmentId);
    const doctorEventId = rowFor(before, doctorUserId)!.googleEventId!;
    adapter.events.delete(doctorEventId);
    const created = adapter.createCount;

    await syncAppointmentCalendar(appointmentId, "update");
    const after = await participantRows(appointmentId);
    expect(rowFor(after, doctorUserId)?.googleEventId).toBe(doctorEventId);
    expect(rowFor(after, doctorUserId)?.syncStatus).toBe("SYNCED");
    expect(adapter.createCount).toBe(created + 1);
    expect(adapter.events.has(doctorEventId)).toBe(true);
  });

  it("does not duplicate an existing event when create is retried", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();
    const first = await participantRows(appointmentId);
    const doctorEventId = rowFor(first, doctorUserId)!.googleEventId;
    const patientEventId = rowFor(first, patientId)!.googleEventId;
    expect(adapter.createCount).toBe(2);

    await syncAppointmentCalendar(appointmentId, "create");
    const second = await participantRows(appointmentId);
    expect(rowFor(second, doctorUserId)?.googleEventId).toBe(doctorEventId);
    expect(rowFor(second, patientId)?.googleEventId).toBe(patientEventId);
    expect(adapter.createCount).toBe(2);
    expect(adapter.updateCount).toBe(2);
    expect(adapter.events.size).toBe(2);
  });

  it("updates both events on reschedule and keeps the original event ids", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();
    const before = await participantRows(appointmentId);
    const doctorEventId = rowFor(before, doctorUserId)!.googleEventId;
    const patientEventId = rowFor(before, patientId)!.googleEventId;
    const next = nextSlot();

    const rescheduled = await request(app)
      .post(`/api/patient/appointments/${appointmentId}/reschedule`)
      .set("Authorization", `Bearer ${patientToken}`)
      .send({ startAt: next.toISOString() });
    expect(rescheduled.status).toBe(200);
    expect(rescheduled.body.data.status).toBe("BOOKED");
    expect(rescheduled.body.data.id).toBe(appointmentId);
    await drainJobs();

    const after = await participantRows(appointmentId);
    expect(rowFor(after, doctorUserId)?.googleEventId).toBe(doctorEventId);
    expect(rowFor(after, patientId)?.googleEventId).toBe(patientEventId);
    expect(adapter.updateCount).toBeGreaterThanOrEqual(2);
    expect(adapter.events.get(doctorEventId!)?.startAt.toISOString()).toBe(next.toISOString());
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("BOOKED");
    expect(appointment.symptoms).toBe(symptoms);
  });

  it("deletes both events on cancellation without rolling back the cancel", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();
    const before = await participantRows(appointmentId);
    const ids = [rowFor(before, doctorUserId)!.googleEventId!, rowFor(before, patientId)!.googleEventId!];

    const cancelled = await request(app)
      .post(`/api/patient/appointments/${appointmentId}/cancel`)
      .set("Authorization", `Bearer ${patientToken}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");
    await drainJobs();

    const after = await participantRows(appointmentId);
    expect(rowFor(after, doctorUserId)?.googleEventId).toBeNull();
    expect(rowFor(after, patientId)?.googleEventId).toBeNull();
    expect(adapter.deleteCount).toBe(2);
    for (const id of ids) expect(adapter.events.has(id)).toBe(false);
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(appointment.status).toBe("CANCELLED");
    expect(appointment.symptoms).toBe(symptoms);
  });

  it("deletes both events when leave resolution cancels the visit", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    const appointmentId = await confirmVisit();
    await drainJobs();
    const appointment = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    await prisma.appointment.updateMany({
      where: { doctorId, id: { not: appointmentId }, status: { in: ["BOOKED", "HELD"] } },
      data: { status: "CANCELLED", occupancyKey: null },
    });
    adapter.deleteCount = 0;
    const dateStr = clinicDateOf(appointment.startAt);

    const created = await request(app)
      .post("/api/admin/leave")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ doctorId, startDate: dateStr, endDate: dateStr, reason: "Conference" });
    expect(created.status).toBe(201);

    const resolved = await request(app)
      .post(`/api/admin/leave/${created.body.data.id}/resolve`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(resolved.status).toBe(200);
    await drainJobs();

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
    expect(row.status).toBe("CANCELLED");
    expect(row.cancelReason).toBe("LEAVE");
    const events = await participantRows(appointmentId);
    expect(rowFor(events, doctorUserId)?.googleEventId).toBeNull();
    expect(rowFor(events, patientId)?.googleEventId).toBeNull();
    expect(adapter.deleteCount).toBe(2);
  });

  it("retries a calendar job idempotently without duplicating events", async () => {
    await setUserCalendarConnected(doctorUserId, true);
    await setUserCalendarConnected(patientId, true);
    await setSimulationFlag("CALENDAR", true);
    const appointmentId = await confirmVisit();
    await drainJobs();
    expect(adapter.createCount).toBe(0);

    await setSimulationFlag("CALENDAR", false);
    await prisma.job.updateMany({
      where: { type: "CALENDAR_SYNC", status: "RETRYING" },
      data: { availableAt: new Date(Date.now() - 1000) },
    });
    await drainJobs();
    expect(adapter.createCount).toBe(2);
    const first = await participantRows(appointmentId);
    const doctorEventId = rowFor(first, doctorUserId)?.googleEventId;
    const patientEventId = rowFor(first, patientId)?.googleEventId;

    await prisma.job.create({
      data: {
        type: "CALENDAR_SYNC",
        payload: { appointmentId, action: "create" },
      },
    });
    await drainJobs();
    expect(adapter.createCount).toBe(2);
    expect(adapter.updateCount).toBe(2);
    const second = await participantRows(appointmentId);
    expect(rowFor(second, doctorUserId)?.googleEventId).toBe(doctorEventId);
    expect(rowFor(second, patientId)?.googleEventId).toBe(patientEventId);
  });

  it("does not let a patient access another patient's or a doctor's calendar routes", async () => {
    const forbiddenDoctor = await request(app)
      .get("/api/doctor/calendar/status")
      .set("Authorization", `Bearer ${patientToken}`);
    expect(forbiddenDoctor.status).toBe(403);

    await setUserCalendarConnected(patientId, true);
    const otherStatus = await request(app)
      .get("/api/patient/calendar/status")
      .set("Authorization", `Bearer ${otherPatientToken}`);
    expect(otherStatus.status).toBe(200);
    expect(otherStatus.body.data.connected).toBe(false);
    expect(JSON.stringify(otherStatus.body)).not.toContain("googleRefreshToken");
    expect(JSON.stringify(otherStatus.body)).not.toContain("test-refresh");

    const hijack = await request(app)
      .post("/api/patient/calendar/disconnect")
      .set("Authorization", `Bearer ${otherPatientToken}`)
      .send({ userId: patientId });
    expect(hijack.status).toBe(200);
    const stillConnected = await prisma.user.findUniqueOrThrow({ where: { id: patientId } });
    expect(stillConnected.calendarConnected).toBe(true);
    expect(stillConnected.googleRefreshToken).toBeTruthy();
  });

  it("does not let a doctor access another doctor's or a patient's calendar routes", async () => {
    const forbiddenPatient = await request(app)
      .post("/api/patient/calendar/connect")
      .set("Authorization", `Bearer ${doctorToken}`)
      .send({ returnTo: "http://localhost:5173" });
    expect(forbiddenPatient.status).toBe(403);

    await setUserCalendarConnected(doctorUserId, true);
    const otherStatus = await request(app)
      .get("/api/doctor/calendar/status")
      .set("Authorization", `Bearer ${otherDoctorToken}`);
    expect(otherStatus.status).toBe(200);
    expect(otherStatus.body.data.connected).toBe(false);
    expect(JSON.stringify(otherStatus.body)).not.toContain("googleRefreshToken");
    expect(JSON.stringify(otherStatus.body)).not.toContain("test-refresh");
  });
});
