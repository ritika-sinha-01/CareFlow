import { writeWorkerHeartbeat } from "./heartbeat.service.js";
import { expireStaleHolds } from "../services/hold-expiry.service.js";
import { processDueJobs } from "../services/job.service.js";
import { processDueMedicationReminders } from "../services/medication-reminder.service.js";
import { processDueNotifications } from "../services/notification.service.js";

export async function runWorkerTick(): Promise<void> {
  await writeWorkerHeartbeat();

  const steps = [expireStaleHolds, processDueJobs, processDueMedicationReminders, processDueNotifications];
  for (const step of steps) {
    try {
      await step();
    } catch {
      // One subsystem failure must not skip remaining work or the heartbeat.
    }
  }
}
