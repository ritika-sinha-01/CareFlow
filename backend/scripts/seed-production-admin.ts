import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";

const HASH_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ProductionAdminSeedInput = {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
};

export type ProductionAdminSeedSummary = {
  created: boolean;
  updated: boolean;
  skipped: boolean;
  email: string;
  reason?: string;
};

export function isLocalDatabaseUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|\[::1\]|:54329\b/i.test(url);
}

export function assertProductionAdminPassword(password: string): void {
  if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new Error(
      "PRODUCTION_ADMIN_PASSWORD must be at least 10 characters and include a letter and a number. No database changes were made.",
    );
  }
}

export function readProductionAdminSeedInput(env: NodeJS.ProcessEnv = process.env): ProductionAdminSeedInput {
  const email = env.PRODUCTION_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const password = env.PRODUCTION_ADMIN_PASSWORD ?? "";
  const firstName = env.PRODUCTION_ADMIN_FIRST_NAME?.trim() || "Clinic";
  const lastName = env.PRODUCTION_ADMIN_LAST_NAME?.trim() || "Admin";

  if (!email || !EMAIL_PATTERN.test(email)) {
    throw new Error("PRODUCTION_ADMIN_EMAIL must be a valid email address. No database changes were made.");
  }
  if (!password) {
    throw new Error("PRODUCTION_ADMIN_PASSWORD is required. No database changes were made.");
  }
  assertProductionAdminPassword(password);

  return { email, password, firstName, lastName };
}

export function assertProductionAdminSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.ALLOW_PRODUCTION_ADMIN_SEED !== "true") {
    throw new Error(
      "Refusing to run production admin seed. Set ALLOW_PRODUCTION_ADMIN_SEED=true explicitly. No database changes were made.",
    );
  }
  if (env.NODE_ENV !== "production") {
    throw new Error(
      "Refusing to run production admin seed because NODE_ENV is not production. No database changes were made.",
    );
  }
  const databaseUrl = env.DATABASE_URL?.trim() ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. No database changes were made.");
  }
  if (isLocalDatabaseUrl(databaseUrl)) {
    throw new Error(
      "Refusing to run production admin seed against a localhost database. Point DATABASE_URL at Neon in this shell session (do not edit .env files). No database changes were made.",
    );
  }
  readProductionAdminSeedInput(env);
}

export async function seedProductionAdmin(
  prisma: PrismaClient,
  input: ProductionAdminSeedInput,
): Promise<ProductionAdminSeedSummary> {
  const email = input.email.trim().toLowerCase();
  const firstName = input.firstName?.trim() || "Clinic";
  const lastName = input.lastName?.trim() || "Admin";
  const passwordHash = await bcrypt.hash(input.password, HASH_ROUNDS);

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.role !== "ADMIN") {
    return {
      created: false,
      updated: false,
      skipped: true,
      email,
      reason: `exists as ${existing.role} and was left unchanged`,
    };
  }

  if (!existing) {
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "ADMIN",
        firstName,
        lastName,
        isDemo: false,
      },
    });
    return { created: true, updated: false, skipped: false, email };
  }

  await prisma.user.update({
    where: { id: existing.id },
    data: {
      passwordHash,
      firstName,
      lastName,
      role: "ADMIN",
      isDemo: false,
    },
  });
  return { created: false, updated: true, skipped: false, email };
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

function printSummary(summary: ProductionAdminSeedSummary): void {
  console.log("Production admin seed complete.");
  console.log(`email: ${summary.email}`);
  console.log(`created: ${summary.created}`);
  console.log(`updated: ${summary.updated}`);
  console.log(`skipped: ${summary.skipped}`);
  if (summary.reason) console.log(`reason: ${summary.reason}`);
}

async function main(): Promise<void> {
  loadEnvFiles();
  assertProductionAdminSeedAllowed();
  const input = readProductionAdminSeedInput();

  const prisma = new PrismaClient();
  try {
    printSummary(await seedProductionAdmin(prisma, input));
  } finally {
    await prisma.$disconnect();
  }
}

if (/seed-production-admin/.test(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
