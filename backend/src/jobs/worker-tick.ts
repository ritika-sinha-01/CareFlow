import { writeWorkerHeartbeat } from "./heartbeat.service.js";
import { expireStaleHolds } from "../services/hold-expiry.service.js";
import { processDueJobs } from "../services/job.service.js";
import { processDueMedicationReminders } from "../services/medication-reminder.service.js";
import { processDueNotifications } from "../services/notification.service.js";

export async function runWorkerTick(): Promise<void> {
  await writeWorkerHeartbeat();
  await expireStaleHolds();
  await processDueJobs();
  await processDueMedicationReminders();
  await processDueNotifications();
}
