import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { writeWorkerHeartbeat } from "./jobs/heartbeat.service.js";
import { expireStaleHolds } from "./services/hold-expiry.service.js";
import { processDueJobs } from "./services/job.service.js";
import { processDueMedicationReminders } from "./services/medication-reminder.service.js";
import { processDueNotifications } from "./services/notification.service.js";

const SHUTDOWN_MS = 10_000;
let shuttingDown = false;
let tickInFlight: Promise<void> | null = null;
let wakeSleep: (() => void) | null = null;

async function tick(): Promise<void> {
  await writeWorkerHeartbeat();
  await expireStaleHolds();
  await processDueJobs();
  await processDueMedicationReminders();
  await processDueNotifications();
}

function sleepOrShutdown(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    wakeSleep = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

async function loop(): Promise<void> {
  console.log("CareFlow worker started");
  while (!shuttingDown) {
    try {
      tickInFlight = tick();
      await tickInFlight;
    } catch (error) {
      console.error("[worker]", error instanceof Error ? error.message : "tick failed");
    } finally {
      tickInFlight = null;
    }
    if (shuttingDown) break;
    await sleepOrShutdown(env.WORKER_POLL_INTERVAL_MS);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`CareFlow worker shutting down (${signal})`);
  wakeSleep?.();

  await Promise.race([
    tickInFlight ?? Promise.resolve(),
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, SHUTDOWN_MS);
      timer.unref();
    }),
  ]);

  await prisma.$disconnect().catch(() => undefined);
  process.exit(0);
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

loop()
  .catch((error) => {
    console.error("[worker-fatal]", error instanceof Error ? error.message : "worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!shuttingDown) {
      await prisma.$disconnect().catch(() => undefined);
    }
  });
