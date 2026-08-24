import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { getWorkerHeartbeat } from "../jobs/heartbeat.service.js";
import { getEmailConfigurationState } from "./email.service.js";
import { getAiConfigurationState } from "./ai.service.js";
import { getCalendarConfigurationState } from "./calendar.service.js";
import { shouldSimulate } from "./demo-simulation.service.js";

export const HEALTH_STATUSES = ["OPERATIONAL", "DEGRADED", "UNAVAILABLE"] as const;
export type HealthStatus = (typeof HEALTH_STATUSES)[number];

export type HealthComponentName =
  | "DATABASE"
  | "APPOINTMENT_ENGINE"
  | "AI_SERVICE"
  | "EMAIL_SERVICE"
  | "BACKGROUND_WORKER"
  | "GOOGLE_CALENDAR";

export type HealthComponent = {
  name: HealthComponentName;
  status: HealthStatus;
  detail: string;
  optional?: boolean;
};

export type SystemHealth = {
  status: HealthStatus;
  checkedAt: string;
  clinicTimezone: string;
  components: HealthComponent[];
};

async function checkDatabase(): Promise<HealthComponent> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return {
      name: "DATABASE",
      status: "OPERATIONAL",
      detail: "Connected",
    };
  } catch {
    return {
      name: "DATABASE",
      status: "UNAVAILABLE",
      detail: "Unable to reach the database",
    };
  }
}

async function checkAppointmentEngine(databaseStatus: HealthStatus): Promise<HealthComponent> {
  if (databaseStatus !== "OPERATIONAL") {
    return {
      name: "APPOINTMENT_ENGINE",
      status: "UNAVAILABLE",
      detail: "Waiting for database",
    };
  }

  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'appointments_active_slot_key'
    ) AS exists
  `;

  const indexReady = rows[0]?.exists === true;
  return {
    name: "APPOINTMENT_ENGINE",
    status: indexReady ? "OPERATIONAL" : "DEGRADED",
    detail: indexReady
      ? "Slot uniqueness constraint is in place"
      : "Occupancy unique index is missing",
  };
}

async function checkAiService(): Promise<HealthComponent> {
  if (await shouldSimulate("AI")) {
    return {
      name: "AI_SERVICE",
      status: "DEGRADED",
      detail: "Demo simulation is forcing AI failures — booking still works",
    };
  }
  const state = getAiConfigurationState();
  if (!state.configured) {
    return {
      name: "AI_SERVICE",
      status: "UNAVAILABLE",
      detail: "No API key configured — booking still works",
    };
  }
  if (state.provider === "mock") {
    return {
      name: "AI_SERVICE",
      status: "OPERATIONAL",
      detail: "Mock adapter — live OpenAI is not used",
    };
  }
  return {
    name: "AI_SERVICE",
    status: "OPERATIONAL",
    detail: `API key configured for ${env.OPENAI_MODEL} — live calls are not probed`,
  };
}

async function checkEmailService(): Promise<HealthComponent> {
  if (await shouldSimulate("EMAIL")) {
    return {
      name: "EMAIL_SERVICE",
      status: "DEGRADED",
      detail: "Demo simulation is forcing email failures — booking still works",
    };
  }
  const state = getEmailConfigurationState();
  if (!state.configured) {
    return {
      name: "EMAIL_SERVICE",
      status: "UNAVAILABLE",
      detail: "No Resend or SMTP credentials — booking still works",
    };
  }
  if (state.provider === "test") {
    return {
      name: "EMAIL_SERVICE",
      status: "OPERATIONAL",
      detail: "Test adapter — messages are not delivered to a live mailbox",
    };
  }
  return {
    name: "EMAIL_SERVICE",
    status: "OPERATIONAL",
    detail: `Credentials present for ${state.provider} — live send is not probed`,
  };
}

async function checkWorker(): Promise<HealthComponent> {
  const heartbeat = await getWorkerHeartbeat();
  if (!heartbeat) {
    return {
      name: "BACKGROUND_WORKER",
      status: "UNAVAILABLE",
      detail: "No worker heartbeat yet",
    };
  }

  const age = Date.now() - heartbeat.lastSeenAt.getTime();
  if (age > env.WORKER_HEARTBEAT_STALE_MS) {
    return {
      name: "BACKGROUND_WORKER",
      status: "UNAVAILABLE",
      detail: "Worker heartbeat is stale",
    };
  }

  return {
    name: "BACKGROUND_WORKER",
    status: "OPERATIONAL",
    detail: "Heartbeat received",
  };
}

async function checkCalendar(): Promise<HealthComponent> {
  if (await shouldSimulate("CALENDAR")) {
    return {
      name: "GOOGLE_CALENDAR",
      status: "DEGRADED",
      detail: "Demo simulation is forcing calendar failures — appointments remain valid",
      optional: true,
    };
  }
  const state = getCalendarConfigurationState();
  if (!state.configured) {
    return {
      name: "GOOGLE_CALENDAR",
      status: "UNAVAILABLE",
      detail: "OAuth is not configured — appointments remain valid",
      optional: true,
    };
  }
  if (state.provider === "mock") {
    return {
      name: "GOOGLE_CALENDAR",
      status: "OPERATIONAL",
      detail: "Mock adapter — live Google Calendar is not used",
      optional: true,
    };
  }
  return {
    name: "GOOGLE_CALENDAR",
    status: "OPERATIONAL",
    detail: "OAuth credentials present — live Calendar API is not probed",
    optional: true,
  };
}

export function deriveOverallStatus(components: HealthComponent[]): HealthStatus {
  const required = components.filter((component) => !component.optional);
  if (required.some((component) => component.name === "DATABASE" && component.status === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  if (required.some((component) => component.name === "APPOINTMENT_ENGINE" && component.status === "UNAVAILABLE")) {
    return "UNAVAILABLE";
  }
  if (required.some((component) => component.status !== "OPERATIONAL")) {
    return "DEGRADED";
  }
  return "OPERATIONAL";
}

export async function getSystemHealth(): Promise<SystemHealth> {
  const database = await checkDatabase();
  const [appointmentEngine, worker, ai, email, calendar] = await Promise.all([
    checkAppointmentEngine(database.status),
    database.status === "OPERATIONAL"
      ? checkWorker()
      : Promise.resolve({
          name: "BACKGROUND_WORKER" as const,
          status: "UNAVAILABLE" as const,
          detail: "Waiting for database",
        }),
    checkAiService(),
    checkEmailService(),
    checkCalendar(),
  ]);

  const components: HealthComponent[] = [database, appointmentEngine, ai, email, worker, calendar];

  return {
    status: deriveOverallStatus(components),
    checkedAt: new Date().toISOString(),
    clinicTimezone: env.CLINIC_TIMEZONE,
    components,
  };
}
