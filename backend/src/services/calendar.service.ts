import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { displayName } from "../utils/serializers.js";
import { shouldSimulate } from "./demo-simulation.service.js";
import { recordSystemEvent } from "./system-event.service.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

type OAuthState = {
  doctorUserId: string;
  returnTo: string;
  purpose: "google-calendar";
};

export function isGoogleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);
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

export function getGoogleConnectUrl(doctorUserId: string, returnTo?: string) {
  if (!isGoogleConfigured()) {
    return { configured: false as const, url: null };
  }

  const state = jwt.sign(
    {
      doctorUserId,
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
    if (payload.purpose !== "google-calendar") throw new Error("bad state");
  } catch {
    return `${fallback}?calendar=error`;
  }

  const origin = allowedReturnTo(payload.returnTo);
  const profile = `${origin}/doctor/profile`;

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return `${profile}?calendar=error`;
    }

    await prisma.doctor.update({
      where: { userId: payload.doctorUserId },
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
  await prisma.doctor.update({
    where: { userId },
    data: {
      googleRefreshToken: null,
      googleCalendarId: null,
      calendarConnected: false,
    },
  });
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
    },
  });
  if (!appointment) return;

  const fail = async (status: "UNAVAILABLE" | "NOT_CONNECTED" | "FAILED" | "RETRYING", message: string, retryable: boolean) => {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        calendarSyncStatus: status,
        calendarSyncError: message,
      },
    });
    await prisma.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "CALENDAR_SYNC_FAILED",
        label: "Calendar sync unavailable",
      },
    });
    await recordSystemEvent({
      type: "CALENDAR_SYNC_FAILED",
      message,
      entityType: "appointment",
      entityId: appointment.id,
    });
    if (retryable) throw new Error(message);
  };

  if (shouldSimulate("CALENDAR")) {
    await fail("RETRYING", "Simulated calendar failure. The appointment remains valid.", true);
    return;
  }

  if (!isGoogleConfigured()) {
    await fail("UNAVAILABLE", "Google Calendar is not configured. The appointment remains valid.", false);
    return;
  }

  if (!appointment.doctor.calendarConnected || !appointment.doctor.googleRefreshToken) {
    await fail("NOT_CONNECTED", "The clinician has not connected Google Calendar. The appointment remains valid.", false);
    return;
  }

  try {
    const accessToken = await refreshAccessToken(appointment.doctor.googleRefreshToken);
    if (action === "delete") {
      if (appointment.googleEventId) {
        await calendarFetch(`/calendars/primary/events/${encodeURIComponent(appointment.googleEventId)}`, {
          method: "DELETE",
          accessToken,
        });
      }
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { calendarSyncStatus: "SYNCED", calendarSyncError: null, googleEventId: null },
      });
      return;
    }

    const body = {
      summary: `CareFlow visit${appointment.patient ? ` · ${displayName(appointment.patient)}` : ""}`,
      description: "CareFlow appointment. Symptom details are not stored on the calendar.",
      start: { dateTime: appointment.startAt.toISOString() },
      end: { dateTime: appointment.endAt.toISOString() },
    };

    let eventId = appointment.googleEventId;
    if (action === "update" && eventId) {
      await calendarFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        accessToken,
        body,
      });
    } else {
      const created = await calendarFetch<{ id: string }>("/calendars/primary/events", {
        method: "POST",
        accessToken,
        body,
      });
      eventId = created.id;
    }

    await prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        googleEventId: eventId,
        calendarSyncStatus: "SYNCED",
        calendarSyncError: null,
      },
    });
    await prisma.appointmentTimelineEvent.create({
      data: {
        appointmentId: appointment.id,
        code: "CALENDAR_EVENT_CREATED",
        label: "Calendar event updated",
      },
    });
    await recordSystemEvent({
      type: "CALENDAR_SYNCED",
      message: "Appointment written to Google Calendar.",
      entityType: "appointment",
      entityId: appointment.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Simulated calendar")) throw error;
    await fail("RETRYING", "Calendar sync failed. The appointment remains valid.", true);
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
  if (!response.ok) throw new Error("calendar api failed");
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
