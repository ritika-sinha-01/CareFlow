import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { writeWorkerHeartbeat } from "./jobs/heartbeat.service.js";
import { expireStaleHolds } from "./services/hold-expiry.service.js";
import { processDueJobs } from "./services/job.service.js";
import { processDueMedicationReminders } from "./services/medication-reminder.service.js";
import { processDueNotifications } from "./services/notification.service.js";

let running = true;

async function tick(): Promise<void> {
  await writeWorkerHeartbeat();
  await expireStaleHolds();
  await processDueJobs();
  await processDueMedicationReminders();
  await processDueNotifications();
}

async function loop(): Promise<void> {
  console.log("CareFlow worker started");
  while (running) {
    try {
      await tick();
    } catch (error) {
      console.error("[worker]", error instanceof Error ? error.message : "tick failed");
    }
    await new Promise((resolve) => setTimeout(resolve, env.WORKER_POLL_INTERVAL_MS));
  }
}

process.on("SIGINT", () => {
  running = false;
});
process.on("SIGTERM", () => {
  running = false;
});

loop()
  .catch((error) => {
    console.error("[worker-fatal]", error instanceof Error ? error.message : "worker failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
