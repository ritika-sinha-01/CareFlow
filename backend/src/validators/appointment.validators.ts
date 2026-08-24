import { z } from "zod";

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
});

export const holdSchema = z.object({
  doctorId: z.string().min(1),
  startAt: z.coerce.date(),
});

export const confirmSchema = z.object({
  symptoms: z
    .string()
    .trim()
    .min(8, "Describe your symptoms in a little more detail.")
    .max(4000),
});

export const rescheduleSchema = z.object({
  startAt: z.coerce.date(),
});

export const leaveSchema = z.object({
  doctorId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid start date."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid end date."),
  reason: z.string().trim().max(500).optional(),
});

export const ownLeaveSchema = leaveSchema.omit({ doctorId: true });

export const calendarConnectSchema = z.object({
  returnTo: z.string().url().optional(),
});

export const consultationNotesSchema = z.object({
  clinicalNotes: z
    .string()
    .trim()
    .min(12, "Add a little more detail to the clinical notes.")
    .max(8000),
});

export const prescriptionItemSchema = z.object({
  name: z.string().trim().min(2).max(120),
  dosage: z.string().trim().min(1).max(80),
  frequency: z.string().trim().min(1).max(80),
  duration: z.string().trim().max(80).optional(),
  instructions: z.string().trim().max(400).optional(),
});

export const prescriptionSchema = z.object({
  items: z.array(prescriptionItemSchema).min(1).max(12),
  notes: z.string().trim().max(1000).optional(),
});
