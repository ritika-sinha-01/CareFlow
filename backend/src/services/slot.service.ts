import { prisma } from "../db/prisma.js";
import { Errors } from "../utils/app-error.js";
import { activeOccupancyKey } from "../utils/occupancy-key.js";
import {
  addCalendarDays,
  addMinutes,
  combineLocalDateAndTime,
  formatSlotLabel,
  isoDate,
  toClinicDateInput,
  weekdayOf,
  clinicTimeZone,
} from "../utils/clinic-time.js";
import { env } from "../config/env.js";

export type SlotState = "AVAILABLE" | "BOOKED" | "HELD" | "HELD_BY_YOU" | "UNAVAILABLE" | "PAST";

export type PublicSlot = {
  startAt: string;
  endAt: string;
  label: string;
  state: SlotState;
  holdExpiresAt: string | null;
  remainingSeconds: number | null;
};

function isOnLeave(leaves: Array<{ startDate: Date; endDate: Date }>, dateStr: string): boolean {
  return leaves.some((leave) => isoDate(leave.startDate) <= dateStr && isoDate(leave.endDate) >= dateStr);
}

export function generateSlotStarts(
  dateStr: string,
  startTime: string,
  endTime: string,
  durationMin: number,
  timeZone = env.CLINIC_TIMEZONE,
): Date[] {
  const starts: Date[] = [];
  let cursor = combineLocalDateAndTime(dateStr, startTime, timeZone);
  const end = combineLocalDateAndTime(dateStr, endTime, timeZone);
  while (addMinutes(cursor, durationMin).getTime() <= end.getTime()) {
    starts.push(cursor);
    cursor = addMinutes(cursor, durationMin);
  }
  return starts;
}

export async function listSlotsForDoctor(doctorId: string, dateStr: string, viewerId?: string) {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: {
      workingHours: true,
      leaves: true,
    },
  });
  if (!doctor) throw Errors.notFound("This doctor profile is not available.");

  const weekday = weekdayOf(dateStr);
  const hours = doctor.workingHours.find((item) => item.weekday === weekday);
  const onLeave = isOnLeave(doctor.leaves, dateStr);

  if (!hours) {
    return {
      date: dateStr,
      clinicTimezone: clinicTimeZone(),
      slotDurationMin: doctor.slotDurationMin,
      holdMinutes: env.SLOT_HOLD_MINUTES,
      closed: true,
      onLeave,
      slots: [] as PublicSlot[],
    };
  }

  const starts = generateSlotStarts(dateStr, hours.startTime, hours.endTime, doctor.slotDurationMin);
  const dayStart = combineLocalDateAndTime(dateStr, "00:00");
  const dayEnd = addMinutes(combineLocalDateAndTime(dateStr, "23:59"), 1);

  const occupied = await prisma.appointment.findMany({
    where: {
      doctorId,
      status: { in: ["HELD", "BOOKED", "BLOCKED"] },
      startAt: { gte: dayStart, lt: dayEnd },
    },
  });
  const byKey = new Map(occupied.map((row) => [row.occupancyKey, row]));
  const now = Date.now();

  const slots: PublicSlot[] = starts.map((startAt) => {
    const endAt = addMinutes(startAt, doctor.slotDurationMin);
    const row = byKey.get(activeOccupancyKey(startAt));
    let state: SlotState = "AVAILABLE";
    let holdExpiresAt: string | null = null;
    let remainingSeconds: number | null = null;

    if (onLeave) {
      state = "UNAVAILABLE";
    } else if (startAt.getTime() <= now) {
      state = "PAST";
    } else if (row?.status === "BLOCKED") {
      state = "UNAVAILABLE";
    } else if (row?.status === "BOOKED") {
      state = "BOOKED";
    } else if (row?.status === "HELD") {
      const expired = !row.holdExpiresAt || row.holdExpiresAt.getTime() <= now;
      if (expired) {
        state = "AVAILABLE";
      } else {
        holdExpiresAt = row.holdExpiresAt?.toISOString() ?? null;
        remainingSeconds = row.holdExpiresAt
          ? Math.max(0, Math.floor((row.holdExpiresAt.getTime() - now) / 1000))
          : null;
        state = row.heldByUserId === viewerId ? "HELD_BY_YOU" : "HELD";
      }
    }

    return {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      label: formatSlotLabel(startAt),
      state,
      holdExpiresAt,
      remainingSeconds,
    };
  });

  return {
    date: dateStr,
    clinicTimezone: clinicTimeZone(),
    slotDurationMin: doctor.slotDurationMin,
    holdMinutes: env.SLOT_HOLD_MINUTES,
    closed: false,
    onLeave,
    slots,
  };
}

export async function assertSlotBookable(doctorId: string, startAt: Date): Promise<{ endAt: Date }> {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, leaves: true },
  });
  if (!doctor) throw Errors.notFound("This doctor profile is not available.");

  const dateStr = toClinicDateInput(startAt);
  if (isOnLeave(doctor.leaves, dateStr)) {
    throw Errors.doctorOnLeave();
  }

  const hours = doctor.workingHours.find((item) => item.weekday === weekdayOf(dateStr));
  if (!hours) throw Errors.doctorUnavailable();

  const validStarts = generateSlotStarts(dateStr, hours.startTime, hours.endTime, doctor.slotDurationMin);
  const match = validStarts.find((slot) => slot.getTime() === startAt.getTime());
  if (!match) throw Errors.slotUnavailable();
  if (startAt.getTime() <= Date.now()) throw Errors.slotUnavailable();

  return { endAt: addMinutes(startAt, doctor.slotDurationMin) };
}

export async function nextAvailableSlot(doctorId: string): Promise<string | null> {
  const doctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { workingHours: true, leaves: true },
  });
  if (!doctor) return null;

  const openWeekdays = new Set(doctor.workingHours.map((item) => item.weekday));
  if (openWeekdays.size === 0) return null;

  const todayStr = toClinicDateInput(new Date());
  for (let offset = 0; offset < 14; offset += 1) {
    const dateStr = addCalendarDays(todayStr, offset);
    if (!openWeekdays.has(weekdayOf(dateStr))) continue;
    if (isOnLeave(doctor.leaves, dateStr)) continue;
    const listed = await listSlotsForDoctor(doctorId, dateStr);
    const open = listed.slots.find((slot) => slot.state === "AVAILABLE");
    if (open) return open.startAt;
  }
  return null;
}
