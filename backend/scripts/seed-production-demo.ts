import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

const HASH_ROUNDS = 10;
const DEMO_PASSWORD = "CareFlow!demo1";
const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const START_TIME = "09:00";
const END_TIME = "17:00";

export const PRODUCTION_DEMO_DOCTORS = [
  {
    email: "ananya.sharma@careflow.demo",
    firstName: "Ananya",
    lastName: "Sharma",
    specialization: "Cardiology",
    slotDurationMin: 30,
    yearsExperience: 12,
  },
  {
    email: "rohan.mehta@careflow.demo",
    firstName: "Rohan",
    lastName: "Mehta",
    specialization: "Dermatology",
    slotDurationMin: 20,
    yearsExperience: 8,
  },
  {
    email: "priya.nair@careflow.demo",
    firstName: "Priya",
    lastName: "Nair",
    specialization: "General Practice",
    slotDurationMin: 30,
    yearsExperience: 10,
  },
  {
    email: "vikram.joshi@careflow.demo",
    firstName: "Vikram",
    lastName: "Joshi",
    specialization: "Pediatrics",
    slotDurationMin: 30,
    yearsExperience: 9,
  },
  {
    email: "sara.khan@careflow.demo",
    firstName: "Sara",
    lastName: "Khan",
    specialization: "Orthopedics",
    slotDurationMin: 30,
    yearsExperience: 11,
  },
  {
    email: "dev.patel@careflow.demo",
    firstName: "Dev",
    lastName: "Patel",
    specialization: "Neurology",
    slotDurationMin: 30,
    yearsExperience: 14,
  },
] as const;

export type ProductionDemoSeedSummary = {
  doctorsCreated: number;
  doctorsAlreadyExisting: number;
  doctorsSkipped: number;
  workingHoursCreated: number;
  workingHoursAlreadyExisting: number;
  skipped: string[];
};

export function assertProductionDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ALLOW_PRODUCTION_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to run production demo seed. Set ALLOW_PRODUCTION_DEMO_SEED=true explicitly. No database changes were made.",
    );
  }
  if (env.NODE_ENV !== "production") {
    throw new Error(
      "Refusing to run production demo seed because NODE_ENV is not production. No database changes were made.",
    );
  }
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. No database changes were made.");
  }
  if (isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      "Refusing to run production demo seed against a localhost database. Point DATABASE_URL at Neon in this shell session (do not edit .env files). No database changes were made.",
    );
  }
}

export function isLocalDatabaseUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|\[::1\]|:54329\b/i.test(url);
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function seedProductionDemoDoctors(prisma: PrismaClient): Promise<ProductionDemoSeedSummary> {
  const summary: ProductionDemoSeedSummary = {
    doctorsCreated: 0,
    doctorsAlreadyExisting: 0,
    doctorsSkipped: 0,
    workingHoursCreated: 0,
    workingHoursAlreadyExisting: 0,
    skipped: [],
  };

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, HASH_ROUNDS);

  for (const profile of PRODUCTION_DEMO_DOCTORS) {
    let user = await prisma.user.findUnique({
      where: { email: profile.email },
      include: { doctor: { include: { workingHours: true } } },
    });

    if (user && (user.role !== "DOCTOR" || user.isDemo !== true)) {
      summary.doctorsSkipped += 1;
      summary.skipped.push(`${profile.email} exists as a non-demo ${user.role} and was left unchanged`);
      continue;
    }

    if (!user) {
      try {
        user = await prisma.user.create({
          data: {
            email: profile.email,
            passwordHash,
            role: "DOCTOR",
            firstName: profile.firstName,
            lastName: profile.lastName,
            isDemo: true,
          },
          include: { doctor: { include: { workingHours: true } } },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        user = await prisma.user.findUniqueOrThrow({
          where: { email: profile.email },
          include: { doctor: { include: { workingHours: true } } },
        });
      }
    }

    let doctor = user.doctor;
    if (!doctor) {
      try {
        doctor = await prisma.doctor.create({
          data: {
            userId: user.id,
            specialization: profile.specialization,
            slotDurationMin: profile.slotDurationMin,
            yearsExperience: profile.yearsExperience,
            isDemo: true,
            bio: "Demo clinician profile for the CareFlow assessment environment. Not a real clinician.",
          },
          include: { workingHours: true },
        });
        summary.doctorsCreated += 1;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        doctor = await prisma.doctor.findUniqueOrThrow({
          where: { userId: user.id },
          include: { workingHours: true },
        });
        summary.doctorsAlreadyExisting += 1;
      }
    } else {
      summary.doctorsAlreadyExisting += 1;
    }

    const existingWeekdays = new Set(doctor.workingHours.map((item) => item.weekday));
    const missingHours = WEEKDAYS.filter((weekday) => !existingWeekdays.has(weekday)).map((weekday) => ({
      doctorId: doctor.id,
      weekday,
      startTime: START_TIME,
      endTime: END_TIME,
    }));

    summary.workingHoursAlreadyExisting += WEEKDAYS.filter((weekday) => existingWeekdays.has(weekday)).length;

    if (missingHours.length > 0) {
      const created = await prisma.doctorWorkingHour.createMany({
        data: missingHours,
        skipDuplicates: true,
      });
      summary.workingHoursCreated += created.count;
      summary.workingHoursAlreadyExisting += missingHours.length - created.count;
    }
  }

  return summary;
}

function loadEnvFiles(): void {
  for (const file of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "backend/.env"),
    resolve(process.cwd(), "../.env"),
  ]) {
    if (existsSync(file)) dotenv.config({ path: file, override: false });
  }
}

function printSummary(summary: ProductionDemoSeedSummary): void {
  console.log("Production demo doctor seed complete.");
  console.log(`doctors created: ${summary.doctorsCreated}`);
  console.log(`doctors already existing: ${summary.doctorsAlreadyExisting}`);
  console.log(`working hours created: ${summary.workingHoursCreated}`);
  console.log(`working hours already existing: ${summary.workingHoursAlreadyExisting}`);
  console.log("Demo doctor password: CareFlow!demo1");
  if (summary.doctorsSkipped > 0) {
    console.log(`doctors skipped (existing real users left unchanged): ${summary.doctorsSkipped}`);
    for (const reason of summary.skipped) console.log(`  - ${reason}`);
  }
}

async function main(): Promise<void> {
  loadEnvFiles();
  assertProductionDemoSeedAllowed();

  const prisma = new PrismaClient();
  try {
    printSummary(await seedProductionDemoDoctors(prisma));
  } finally {
    await prisma.$disconnect();
  }
}

if (/seed-production-demo/.test(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
