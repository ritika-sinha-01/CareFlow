import type { User } from "@prisma/client";

export type PublicUser = {
  id: string;
  email: string;
  role: User["role"];
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  isDemo: boolean;
};

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString().slice(0, 10) : null,
    isDemo: user.isDemo,
  };
}

export function displayName(user: Pick<User, "firstName" | "lastName">): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

export function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export type PrescriptionItem = {
  name: string;
  dosage: string;
  frequency: string;
  duration?: string;
  instructions?: string;
};

export function asPrescriptionItems(value: unknown): PrescriptionItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (typeof row.name !== "string" || typeof row.dosage !== "string" || typeof row.frequency !== "string") {
      return [];
    }
    return [
      {
        name: row.name,
        dosage: row.dosage,
        frequency: row.frequency,
        duration: typeof row.duration === "string" ? row.duration : undefined,
        instructions: typeof row.instructions === "string" ? row.instructions : undefined,
      },
    ];
  });
}
