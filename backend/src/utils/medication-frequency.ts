import { addCalendarDays, clinicLocalToUtc, toClinicDateInput } from "./clinic-time.js";

export type MedicationCadence =
  | { kind: "prn" }
  | { kind: "times"; hhmm: string[] }
  | { kind: "intervalHours"; hours: number };

export function parseMedicationFrequency(raw: string): MedicationCadence {
  const text = raw.trim().toLowerCase();
  if (/\b(as needed|when required|prn|sos)\b/.test(text)) {
    return { kind: "prn" };
  }
  if (/\b(twice daily|twice a day|two times daily|bid|bd)\b/.test(text)) {
    return { kind: "times", hhmm: ["08:00", "20:00"] };
  }
  if (/\b(three times daily|three times a day|thrice daily|tid|tds)\b/.test(text)) {
    return { kind: "times", hhmm: ["08:00", "14:00", "20:00"] };
  }
  const every = text.match(/every\s+(\d+)\s+hours?/);
  if (every) {
    const hours = Number(every[1]);
    if (hours === 4 || hours === 6 || hours === 8 || hours === 12) {
      return { kind: "intervalHours", hours };
    }
  }
  if (/\b(once daily|once a day|daily|every day|qd|od)\b/.test(text)) {
    return { kind: "times", hhmm: ["08:00"] };
  }
  return { kind: "times", hhmm: ["08:00"] };
}

export function nextMedicationFireAt(
  frequency: string,
  from: Date,
  timeZone: string,
): Date | null {
  const cadence = parseMedicationFrequency(frequency);
  if (cadence.kind === "prn") return null;
  if (cadence.kind === "intervalHours") {
    return new Date(from.getTime() + cadence.hours * 60 * 60_000);
  }

  for (let offset = 0; offset < 3; offset += 1) {
    const dateStr = addCalendarDays(toClinicDateInput(from, timeZone), offset);
    for (const time of cadence.hhmm) {
      const instant = clinicLocalToUtc(dateStr, time, timeZone);
      if (instant.getTime() > from.getTime()) return instant;
    }
  }
  const tomorrow = addCalendarDays(toClinicDateInput(from, timeZone), 1);
  return clinicLocalToUtc(tomorrow, cadence.hhmm[0] ?? "08:00", timeZone);
}
