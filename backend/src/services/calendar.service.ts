import jwt from "jsonwebtoken";
import type { CalendarSyncStatus, UserRole } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { displayName } from "../utils/serializers.js";
import { formatSlotLabel, toClinicDateInput } from "../utils/clinic-time.js";
import { shouldSimulate, type SimulationFlag } from "./demo-simulation.service.js";
import { recordSystemEvent } from "./system-event.service.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

type OAuthState = {
  userId: string;
  role: UserRole;
  returnTo: string;
  purpose: "google-calendar";
};

export type CalendarAdapterName = "google" | "mock" | "unconfigured";

export type CalendarEventInput = {
  eventId: string | null;
  summary: string;
  description: string;
  startAt: Date;
  endAt: Date;
  timeZone: string;
  attendees: Array<{ email: string; displayName?: string }>;
  refreshToken: string | null;
};

export interface CalendarAdapter {
  name: CalendarAdapterName;
  configured: boolean;
  upsertEvent(input: CalendarEventInput): Promise<string>;
  deleteEvent(input: { eventId: string; refreshToken: string | null }): Promise<void>;
}

export class UnconfiguredCalendarAdapter implements CalendarAdapter {
  name = "unconfigured" as const;
  configured = false;

  async upsertEvent(): Promise<string> {
    throw new Error("Google Calendar is not configured.");
  }

  async deleteEvent(): Promise<void> {
    throw new Error("Google Calendar is not configured.");
  }
}

export class MockCalendarAdapter implements CalendarAdapter {
  name = "mock" as const;
  configured = true;
  readonly events = new Map<
    string,
    { summary: string; startAt: Date; endAt: Date; attendees: string[]; description: string }
  >();
  createCount = 0;
  updateCount = 0;
  deleteCount = 0;

  async upsertEvent(input: CalendarEventInput): Promise<string> {
    if (input.eventId && this.events.has(input.eventId)) {
      this.updateCount += 1;
      this.events.set(input.eventId, {
        summary: input.summary,
        startAt: input.startAt,
        endAt: input.endAt,
        attendees: input.attendees.map((item) => item.email),
        description: input.description,
      });
      return input.eventId;
    }
    this.createCount += 1;
    const id = input.eventId ?? `mock-event-${this.createCount}`;
    this.events.set(id, {
      summary: input.summary,
      startAt: input.startAt,
      endAt: input.endAt,
      attendees: input.attendees.map((item) => item.email),
      description: input.description,
    });
    return id;
  }

  async deleteEvent(input: { eventId: string }): Promise<void> {
    this.deleteCount += 1;
    this.events.delete(input.eventId);
  }
}

class GoogleCalendarAdapter implements CalendarAdapter {
  name = "google" as const;
  configured = true;

  async upsertEvent(input: CalendarEventInput): Promise<string> {
    if (!input.refreshToken) throw new Error("Google Calendar is not connected.");
    const accessToken = await refreshAccessToken(input.refreshToken);
    const body = {
      summary: input.summary,
      description: input.description,
      start: { dateTime: input.startAt.toISOString(), timeZone: input.timeZone },
      end: { dateTime: input.endAt.toISOString(), timeZone: input.timeZone },
      attendees: input.attendees.map((item) => ({
        email: item.email,
        displayName: item.displayName,
      })),
    };
    if (input.eventId) {
      const patched = await calendarFetch<{ id?: string; missing?: boolean }>(
        `/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=none`,
        {
          method: "PATCH",
          accessToken,
          body,
        },
      );
      if (!patched?.missing) return input.eventId;
    }
    const created = await calendarFetch<{ id: string }>("/calendars/primary/events?sendUpdates=none", {
      method: "POST",
      accessToken,
      body,
    });
    return created.id;
  }

  async deleteEvent(input: { eventId: string; refreshToken: string | null }): Promise<void> {
    if (!input.refreshToken) return;
    const accessToken = await refreshAccessToken(input.refreshToken);
    await calendarFetch(`/calendars/primary/events/${encodeURIComponent(input.eventId)}?sendUpdates=none`, {
      method: "DELETE",
      accessToken,
    });
  }
}

export function createCalendarAdapter(): CalendarAdapter {
  if (env.CALENDAR_PROVIDER === "mock") return new MockCalendarAdapter();
  if (isGoogleConfigured()) return new GoogleCalendarAdapter();
  return new UnconfiguredCalendarAdapter();
}

let calendarAdapter: CalendarAdapter = createCalendarAdapter();

export function getCalendarAdapter(): CalendarAdapter {
  return calendarAdapter;
}

export function setCalendarAdapter(adapter: CalendarAdapter): void {
  calendarAdapter = adapter;
}

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
}

export function getCalendarConfigurationState(): {
  configured: boolean;
  provider: CalendarAdapterName;
} {
  return { configured: calendarAdapter.configured, provider: calendarAdapter.name };
}

function allowedReturnTo(origin: string): string {
  const fallback = env.FRONTEND_URL.replace(/\/$/, "");
  if (!origin) return fallback;
  if (origin === fallback) return origin;
  if (!isProductionLike() && /^http:\/\/localhost:\d+$/.test(origin)) return origin;
  return fallback;
}

function isProductionLike() {
  return env.APP_ENV === "production" || env.NODE_ENV === "production";
}

function profilePath(role: UserRole): string {
  return role === "PATIENT" ? "/patient/profile" : "/doctor/profile";
}

export function getGoogleConnectUrl(userId: string, role: UserRole, returnTo?: string) {
  if (!isGoogleConfigured()) {
    return { configured: false as const, url: null };
  }

  const state = jwt.sign(
    {
      userId,
      role,
      returnTo: allowedReturnTo(returnTo ?? env.FRONTEND_URL),
      purpose: "google-calendar",
    } satisfies OAuthState,
    env.JWT_SECRET,
    { expiresIn: "15m" },
  );

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: CALENDAR_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });

  return { configured: true as const, url: `${GOOGLE_AUTH}?${params.toString()}` };
}

export async function handleGoogleCallback(code: string | undefined, state: string | undefined) {
  const fallback = `${env.FRONTEND_URL.replace(/\/$/, "")}/doctor/profile`;
  if (!code || !state || !isGoogleConfigured()) {
    return `${fallback}?calendar=error`;
  }

  let payload: OAuthState;
  try {
    payload = jwt.verify(state, env.JWT_SECRET) as OAuthState;
    if (payload.purpose !== "google-calendar" || !payload.userId) throw new Error("bad state");
  } catch {
    return `${fallback}?calendar=error`;
  }

  const origin = allowedReturnTo(payload.returnTo);
  const profile = `${origin}${profilePath(payload.role ?? "DOCTOR")}`;

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return `${profile}?calendar=error`;
    }

    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        googleRefreshToken: tokens.refresh_token,
        googleCalendarId: "primary",
        calendarConnected: true,
      },
    });
    return `${profile}?calendar=connected`;
  } catch {
    return `${profile}?calendar=error`;
  }
}

export async function disconnectGoogleCalendar(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      googleRefreshToken: null,
      googleCalendarId: null,
      calendarConnected: false,
    },
  });
}

export function getCalendarConnectionStatus(user: {
  calendarConnected: boolean;
}): {
  configured: boolean;
  connected: boolean;
  status: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE";
} {
  if (!calendarAdapter.configured) {
    return { configured: false, connected: false, status: "UNAVAILABLE" };
  }
  if (user.calendarConnected) {
    return { configured: true, connected: true, status: "CONNECTED" };
  }
  return { configured: true, connected: false, status: "NOT_CONNECTED" };
}

export async function getCalendarStatusForUser(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { calendarConnected: true },
  });
  return getCalendarConnectionStatus(user);
}

export async function ensureCalendarParticipants(appointmentId: string): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctor: true },
  });
  if (!appointment) return;

  const owners = [appointment.doctor.userId];
  if (appointment.patientId) owners.push(appointment.patientId);

  for (const ownerUserId of owners) {
    await prisma.appointmentCalendarEvent.upsert({
      where: {
        appointmentId_ownerUserId: { appointmentId, ownerUserId },
      },
      create: {
        appointmentId,
        ownerUserId,
        syncStatus: "PENDING",
      },
      update: {},
    });
  }
}

function rollupStatus(statuses: CalendarSyncStatus[]): CalendarSyncStatus {
  if (statuses.some((status) => status === "RETRYING")) return "RETRYING";
  if (statuses.some((status) => status === "FAILED")) return "FAILED";
  if (statuses.some((status) => status === "PENDING")) return "PENDING";
  if (statuses.some((status) => status === "SYNCED")) return "SYNCED";
  if (statuses.some((status) => status === "UNAVAILABLE")) return "UNAVAILABLE";
  return "NOT_CONNECTED";
}

async function persistRollup(appointmentId: string): Promise<void> {
  const rows = await prisma.appointmentCalendarEvent.findMany({ where: { appointmentId } });
  const status = rollupStatus(rows.map((row) => row.syncStatus));
  const error = rows.find((row) => row.lastError)?.lastError ?? null;
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { calendarSyncStatus: status, calendarSyncError: error },
  });
}

async function shouldFailOwner(role: UserRole): Promise<boolean> {
  if (await shouldSimulate("CALENDAR")) return true;
  const flag: SimulationFlag = role === "PATIENT" ? "CALENDAR_PATIENT" : "CALENDAR_DOCTOR";
  return await shouldSimulate(flag);
}

export async function syncAppointmentCalendar(
  appointmentId: string,
  action: "create" | "update" | "delete",
): Promise<void> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      doctor: { include: { user: true } },
      patient: true,
      calendarEvents: true,
    },
  });
  if (!appointment) return;

  await ensureCalendarParticipants(appointment.id);
  const rows = await prisma.appointmentCalendarEvent.findMany({
    where: { appointmentId: appointment.id },
    include: { owner: true },
  });

  let retryableFailure = false;
  let wroteTimeline = false;

  for (const row of rows) {
    const result = await syncParticipant(appointment, row, action);
    if (result.retryable) retryableFailure = true;
    if (result.wroteTimeline) wroteTimeline = true;
  }

  await persistRollup(appointment.id);

  if (retryableFailure) {
    throw new Error("Calendar sync failed for at least one participant. The appointment remains valid.");
  }

  if (wroteTimeline && action !== "delete") {
    await prisma.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "CALENDAR_EVENT_CREATED",
        label: "Calendar event updated",
      },
    });
  }
}

async function syncParticipant(
  appointment: {
    id: string;
    startAt: Date;
    endAt: Date;
    doctor: { user: { id: string; firstName: string; lastName: string; email: string }; specialization: string };
    patient: { id: string; firstName: string; lastName: string; email: string } | null;
  },
  row: {
    id: string;
    ownerUserId: string;
    googleEventId: string | null;
    owner: {
      id: string;
      role: UserRole;
      email: string;
      firstName: string;
      lastName: string;
      calendarConnected: boolean;
      googleRefreshToken: string | null;
    };
  },
  action: "create" | "update" | "delete",
): Promise<{ retryable: boolean; wroteTimeline: boolean }> {
  const fail = async (status: CalendarSyncStatus, message: string, retryable: boolean) => {
    await prisma.appointmentCalendarEvent.update({
      where: { id: row.id },
      data: {
        syncStatus: status,
        lastError: message,
      },
    });
    await recordSystemEvent({
      type: "CALENDAR_SYNC_FAILED",
      message,
      entityType: "appointment",
      entityId: appointment.id,
      metadata: { ownerUserId: row.ownerUserId, role: row.owner.role },
    });
    return { retryable, wroteTimeline: false };
  };

  if (await shouldFailOwner(row.owner.role)) {
    return fail("RETRYING", "Simulated calendar failure. The appointment remains valid.", true);
  }

  if (!calendarAdapter.configured) {
    return fail("UNAVAILABLE", "Google Calendar is not configured. The appointment remains valid.", false);
  }

  if (!row.owner.calendarConnected || !row.owner.googleRefreshToken) {
    await prisma.appointmentCalendarEvent.update({
      where: { id: row.id },
      data: {
        syncStatus: "NOT_CONNECTED",
        lastError: null,
        googleEventId: action === "delete" ? null : row.googleEventId,
      },
    });
    return { retryable: false, wroteTimeline: false };
  }

  try {
    if (action === "delete") {
      if (row.googleEventId) {
        await calendarAdapter.deleteEvent({
          eventId: row.googleEventId,
          refreshToken: row.owner.googleRefreshToken,
        });
      }
      await prisma.appointmentCalendarEvent.update({
        where: { id: row.id },
        data: { syncStatus: "SYNCED", lastError: null, googleEventId: null },
      });
      return { retryable: false, wroteTimeline: false };
    }

    const counterpart =
      row.ownerUserId === appointment.doctor.user.id ? appointment.patient : appointment.doctor.user;
    const doctorName = displayName(appointment.doctor.user);
    const patientName = appointment.patient ? displayName(appointment.patient) : "Patient";
    const ownerIsDoctor = row.owner.role === "DOCTOR";
    const summary = ownerIsDoctor ? `CareFlow visit · ${patientName}` : `CareFlow visit · ${doctorName}`;
    const when = `${toClinicDateInput(appointment.startAt)} ${formatSlotLabel(appointment.startAt)} (${env.CLINIC_TIMEZONE})`;
    const description = [
      `Doctor: ${doctorName} (${appointment.doctor.specialization})`,
      `Patient: ${patientName}`,
      `Appointment: ${when}`,
      "Symptom details and clinical notes are not stored on this calendar event.",
    ].join("\n");

    const eventId = await calendarAdapter.upsertEvent({
      eventId: row.googleEventId,
      summary,
      description,
      startAt: appointment.startAt,
      endAt: appointment.endAt,
      timeZone: env.CLINIC_TIMEZONE,
      attendees: counterpart ? [{ email: counterpart.email, displayName: displayName(counterpart) }] : [],
      refreshToken: row.owner.googleRefreshToken,
    });

    await prisma.appointmentCalendarEvent.update({
      where: { id: row.id },
      data: {
        googleEventId: eventId,
        syncStatus: "SYNCED",
        lastError: null,
      },
    });
    await recordSystemEvent({
      type: "CALENDAR_SYNCED",
      message: "Appointment written to Google Calendar.",
      entityType: "appointment",
      entityId: appointment.id,
      metadata: { ownerUserId: row.ownerUserId, role: row.owner.role },
    });
    return { retryable: false, wroteTimeline: true };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Simulated calendar")) {
      return fail("RETRYING", error.message, true);
    }
    return fail("RETRYING", "Calendar sync failed. The appointment remains valid.", true);
  }
}

async function exchangeCode(code: string) {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!response.ok) throw new Error("token exchange failed");
  return (await response.json()) as { access_token?: string; refresh_token?: string };
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error("token refresh failed");
  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error("token refresh failed");
  return body.access_token;
}

async function calendarFetch<T>(
  path: string,
  input: { method: string; accessToken: string; body?: unknown },
): Promise<T> {
  const response = await fetch(`${CALENDAR_API}${path}`, {
    method: input.method,
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
      ...(input.body ? { "Content-Type": "application/json" } : {}),
    },
    body: input.body ? JSON.stringify(input.body) : undefined,
  });
  if (input.method === "DELETE" && (response.status === 204 || response.status === 404)) {
    return undefined as T;
  }
  if (input.method === "PATCH" && response.status === 404) {
    return { missing: true } as T;
  }
  if (!response.ok) throw new Error("calendar api failed");
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
