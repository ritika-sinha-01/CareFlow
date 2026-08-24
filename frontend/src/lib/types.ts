export type UserRole = "PATIENT" | "DOCTOR" | "ADMIN";

export type PublicUser = {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  isDemo: boolean;
};

export type SessionPayload = {
  token?: string;
  user: PublicUser;
  doctor: { id: string; specialization: string } | null;
};

export type SlotState = "AVAILABLE" | "BOOKED" | "HELD" | "HELD_BY_YOU" | "UNAVAILABLE" | "PAST";

export type PublicSlot = {
  startAt: string;
  endAt: string;
  label: string;
  state: SlotState;
  holdExpiresAt: string | null;
  remainingSeconds: number | null;
};

export type SlotDay = {
  date: string;
  clinicTimezone?: string;
  slotDurationMin: number;
  holdMinutes: number;
  closed: boolean;
  onLeave: boolean;
  slots: PublicSlot[];
};

export type DoctorCard = {
  id: string;
  name: string;
  specialization: string;
  bio: string | null;
  slotDurationMin: number;
  yearsExperience: number | null;
  isDemo: boolean;
  workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
  nextAvailableAt?: string | null;
};

export type CalendarParticipant = {
  role: "DOCTOR" | "PATIENT";
  name: string | null;
  status: string;
  error: string | null;
};

export type AppointmentSummary = {
  id: string;
  status: string;
  startAt: string;
  endAt: string;
  holdExpiresAt: string | null;
  calendarSyncStatus: string;
  calendarParticipants?: CalendarParticipant[];
  notifications?: Array<{ id: string; type: string; status: string }>;
  symptoms?: string | null;
  patientSummary?: string | null;
  followUpSteps?: string[];
  doctor: {
    id: string;
    name: string;
    specialization: string;
    isDemo: boolean;
  };
  patient: {
    id: string;
    name: string | null;
    email?: string;
    phone?: string | null;
  } | null;
  ai?: {
    status: string;
    urgency?: "LOW" | "MEDIUM" | "HIGH" | null;
    chiefComplaint?: string | null;
    keySymptoms?: string[];
    suggestedQuestions?: string[];
    error: string | null;
    disclaimer: string;
  };
  timeline?: Array<{ id: string; code: string; label: string; occurredAt: string }>;
  prescriptions?: Array<{
    id: string;
    items: Array<{
      name: string;
      dosage: string;
      frequency: string;
      duration?: string;
      instructions?: string;
    }>;
    notes: string | null;
  }>;
  clinicalNotes?: string | null;
  postVisit?: {
    status: string;
    error: string | null;
    disclaimer: string;
  };
};

export function homeForRole(role: UserRole): string {
  if (role === "DOCTOR") return "/doctor/dashboard";
  if (role === "ADMIN") return "/admin/dashboard";
  return "/patient/dashboard";
}

export function canAccessRoute(role: UserRole | null, allowed: UserRole[]): boolean {
  return role !== null && allowed.includes(role);
}
