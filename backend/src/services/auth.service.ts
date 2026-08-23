import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { signAuthToken, type AuthUser } from "../middleware/auth.js";
import { Errors } from "../utils/app-error.js";
import { toPublicUser } from "../utils/serializers.js";
import type { loginSchema, profileSchema, registerSchema } from "../validators/auth.validators.js";
import type { z } from "zod";

const HASH_ROUNDS = 10;

export async function registerPatient(input: z.infer<typeof registerSchema>) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw Errors.conflict("An account with this email already exists.");
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await bcrypt.hash(input.password, HASH_ROUNDS),
      role: "PATIENT",
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone || null,
    },
  });

  return issueSession(user);
}

export async function login(input: z.infer<typeof loginSchema>) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    throw Errors.invalidCredentials();
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw Errors.invalidCredentials();
  }

  return issueSession(user);
}

export async function getSession(auth: AuthUser) {
  const user = await prisma.user.findUnique({
    where: { id: auth.id },
    include: { doctor: true },
  });
  if (!user) throw Errors.unauthorized();
  return toSession(user);
}

export async function updateProfile(auth: AuthUser, input: z.infer<typeof profileSchema>) {
  const user = await prisma.user.update({
    where: { id: auth.id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    },
    include: { doctor: true },
  });
  return toSession(user);
}

async function issueSession(user: User) {
  const withDoctor = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { doctor: true },
  });
  return {
    token: signAuthToken({ id: user.id, email: user.email, role: user.role }),
    ...toSession(withDoctor),
  };
}

function toSession(user: User & { doctor: { id: string; specialization: string } | null }) {
  return {
    user: toPublicUser(user),
    doctor: user.doctor
      ? { id: user.doctor.id, specialization: user.doctor.specialization }
      : null,
  };
}
