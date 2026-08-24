import { clinicLocalToUtc, toClinicDateInput, addCalendarDays, weekdayOf } from "../src/utils/clinic-time.js";
import { processDueJobs } from "../src/services/job.service.js";
import { processDueNotifications } from "../src/services/notification.service.js";
import { prisma } from "../src/db/prisma.js";

export function nextClinicWeekday(weekday: number, time: string): Date {
  const todayStr = toClinicDateInput(new Date());
  for (let offset = 0; offset < 21; offset += 1) {
    const dateStr = addCalendarDays(todayStr, offset);
    if (weekdayOf(dateStr) !== weekday) continue;
    const start = clinicLocalToUtc(dateStr, time);
    if (start.getTime() > Date.now()) return start;
  }
  return clinicLocalToUtc(addCalendarDays(todayStr, 14), time);
}

export function nextClinicMonday(time = "10:00"): Date {
  return nextClinicWeekday(1, time);
}

export function clinicDateOf(instant: Date): string {
  return toClinicDateInput(instant);
}

export async function drainJobs(batch = 50): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const processed = await processDueJobs(batch);
    if (processed === 0) return;
  }
}

export async function drainNotifications(batch = 50): Promise<void> {
  for (let i = 0; i < 40; i += 1) {
    const processed = await processDueNotifications(batch);
    if (processed === 0) return;
  }
}

export async function setUserCalendarConnected(userId: string, connected: boolean): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: connected
      ? {
          calendarConnected: true,
          googleRefreshToken: `test-refresh-${userId}`,
          googleCalendarId: "primary",
        }
      : {
          calendarConnected: false,
          googleRefreshToken: null,
          googleCalendarId: null,
        },
  });
}
