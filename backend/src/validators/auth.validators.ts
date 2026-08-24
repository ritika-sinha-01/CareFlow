import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z
    .string()
    .min(10, "Use at least 10 characters.")
    .regex(/[A-Za-z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
  firstName: z.string().trim().min(1, "Enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Enter your last name.").max(80),
  phone: z.string().trim().max(30).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").transform((value) => value.toLowerCase()),
  password: z.string().min(1, "Enter your password."),
});

export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).optional(),
});

export const createDoctorSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(10).regex(/[A-Za-z]/).regex(/[0-9]/),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  specialization: z.string().trim().min(2).max(80),
  slotDurationMin: z.coerce.number().int().min(10).max(120).default(30),
  yearsExperience: z.coerce.number().int().min(0).max(60).optional(),
  bio: z.string().trim().max(2000).optional(),
});

const workingHourSchema = z
  .object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: z
      .string()
      .regex(/^\d{2}:\d{2}(?::\d{2})?$/, "Use HH:mm")
      .transform((value) => value.slice(0, 5)),
    endTime: z
      .string()
      .regex(/^\d{2}:\d{2}(?::\d{2})?$/, "Use HH:mm")
      .transform((value) => value.slice(0, 5)),
  })
  .refine((row) => row.startTime < row.endTime, "Working hours must end after they start.");

export const updateDoctorSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  specialization: z.string().trim().min(2).max(80).optional(),
  slotDurationMin: z.coerce.number().int().min(10).max(120).optional(),
  yearsExperience: z.coerce.number().int().min(0).max(60).nullable().optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  workingHours: z.array(workingHourSchema).min(1).max(7).optional(),
});
