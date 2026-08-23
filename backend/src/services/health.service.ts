import { prisma } from "../db/prisma.js";
import { env } from "../config/env.js";
import { getWorkerHeartbeat } from "../jobs/heartbeat.service.js";
import { getEmailConfigurationState } from "./email.service.js";

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

function checkAiService(): HealthComponent {
  if (!env.OPENAI_API_KEY) {
    return {
      name: "AI_SERVICE",
      status: "UNAVAILABLE",
      detail: "No API key configured — booking still works",
    };
  }
  return {
    name: "AI_SERVICE",
    status: "OPERATIONAL",
    detail: `Configured (${env.OPENAI_MODEL})`,
  };
}

function checkEmailService(): HealthComponent {
  const state = getEmailConfigurationState();
  if (!state.configured) {
    return {
      name: "EMAIL_SERVICE",
      status: "UNAVAILABLE",
      detail: "No Resend or SMTP credentials — booking still works",
    };
  }
  return {
    name: "EMAIL_SERVICE",
    status: "OPERATIONAL",
    detail: `Configured via ${state.provider}`,
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

function checkCalendar(): HealthComponent {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    return {
      name: "GOOGLE_CALENDAR",
      status: "UNAVAILABLE",
      detail: "OAuth is not configured — appointments remain valid",
      optional: true,
    };
  }
  return {
    name: "GOOGLE_CALENDAR",
    status: "OPERATIONAL",
    detail: "OAuth credentials present",
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
  const [appointmentEngine, worker] = await Promise.all([
    checkAppointmentEngine(database.status),
    database.status === "OPERATIONAL"
      ? checkWorker()
      : Promise.resolve({
          name: "BACKGROUND_WORKER" as const,
          status: "UNAVAILABLE" as const,
          detail: "Waiting for database",
        }),
  ]);

  const components: HealthComponent[] = [
    database,
    appointmentEngine,
    checkAiService(),
    checkEmailService(),
    worker,
    checkCalendar(),
  ];

  return {
    status: deriveOverallStatus(components),
    checkedAt: new Date().toISOString(),
    components,
  };
}
