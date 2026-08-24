import type { Appointment, AppointmentCalendarEvent, AppointmentTimelineEvent, Doctor, Prescription, User } from "@prisma/client";
import { asPrescriptionItems, asStringArray, displayName } from "../utils/serializers.js";

type CalendarEventRecord = AppointmentCalendarEvent & {
  owner: Pick<User, "id" | "firstName" | "lastName" | "role">;
};

type AppointmentRecord = Appointment & {
  doctor: Doctor & { user: User };
  patient: User | null;
  timeline?: AppointmentTimelineEvent[];
  prescriptions?: Prescription[];
  calendarEvents?: CalendarEventRecord[];
};

function serializeCalendarParticipants(appointment: AppointmentRecord) {
  const doctorUserId = appointment.doctor.user.id;
  const patientUserId = appointment.patient?.id;
  const rows = appointment.calendarEvents ?? [];
  const doctorRow = rows.find((row) => row.ownerUserId === doctorUserId);
  const patientRow = patientUserId ? rows.find((row) => row.ownerUserId === patientUserId) : undefined;
  return [
    {
      role: "DOCTOR" as const,
      name: displayName(appointment.doctor.user),
      status: doctorRow?.syncStatus ?? appointment.calendarSyncStatus,
      error: doctorRow?.lastError ?? null,
    },
    {
      role: "PATIENT" as const,
      name: appointment.patient ? displayName(appointment.patient) : null,
      status: patientRow?.syncStatus ?? appointment.calendarSyncStatus,
      error: patientRow?.lastError ?? null,
    },
  ];
}

export function serializeAppointment(
  appointment: AppointmentRecord,
  audience: "patient" | "doctor" | "admin",
) {
  const doctorName = displayName(appointment.doctor.user);
  const patientName = appointment.patient ? displayName(appointment.patient) : null;

  const base = {
    id: appointment.id,
    status: appointment.status,
    startAt: appointment.startAt.toISOString(),
    endAt: appointment.endAt.toISOString(),
    holdExpiresAt: appointment.holdExpiresAt?.toISOString() ?? null,
    cancelReason: appointment.cancelReason,
    calendarSyncStatus: appointment.calendarSyncStatus,
    calendarParticipants: serializeCalendarParticipants(appointment),
    doctor: {
      id: appointment.doctor.id,
      name: doctorName,
      specialization: appointment.doctor.specialization,
      isDemo: appointment.doctor.isDemo,
    },
    patient: appointment.patient
      ? {
          id: appointment.patient.id,
          name: patientName,
          email: audience === "patient" ? undefined : appointment.patient.email,
          phone: audience === "patient" ? undefined : appointment.patient.phone,
        }
      : null,
  };

  if (audience === "patient") {
    return {
      ...base,
      symptoms: appointment.symptoms,
      patientSummary: appointment.patientSummary,
      followUpSteps: asStringArray(appointment.followUpSteps),
      prescriptions: (appointment.prescriptions ?? []).map((item) => ({
        id: item.id,
        items: asPrescriptionItems(item.items),
        notes: item.notes,
        createdAt: item.createdAt.toISOString(),
      })),
      timeline: (appointment.timeline ?? []).map((event) => ({
        id: event.id,
        code: event.code,
        label: event.label,
        occurredAt: event.occurredAt.toISOString(),
      })),
    };
  }

  return {
    ...base,
    symptoms: appointment.symptoms,
    clinicalNotes: appointment.clinicalNotes,
    patientSummary: appointment.patientSummary,
    followUpSteps: asStringArray(appointment.followUpSteps),
    medicationSchedule: appointment.medicationSchedule,
    ai: {
      status: appointment.aiPreVisitStatus,
      urgency: appointment.aiUrgency,
      chiefComplaint: appointment.aiChiefComplaint,
      keySymptoms: asStringArray(appointment.aiKeySymptoms),
      suggestedQuestions: asStringArray(appointment.aiSuggestedQuestions),
      error: appointment.aiPreVisitError,
      generatedAt: appointment.aiPreVisitGeneratedAt?.toISOString() ?? null,
      disclaimer: "AI-generated visit briefing. Not a medical diagnosis.",
    },
    prescriptions: (appointment.prescriptions ?? []).map((item) => ({
      id: item.id,
      items: asPrescriptionItems(item.items),
      notes: item.notes,
      createdAt: item.createdAt.toISOString(),
    })),
    postVisit: {
      status: appointment.aiPostVisitStatus ?? "IDLE",
      error: appointment.aiPostVisitError,
      disclaimer: "Patient summary is AI-assisted. It is not a diagnosis.",
    },
    timeline: (appointment.timeline ?? []).map((event) => ({
      id: event.id,
      code: event.code,
      label: event.label,
      occurredAt: event.occurredAt.toISOString(),
    })),
  };
}

export const appointmentInclude = {
  doctor: { include: { user: true } },
  patient: true,
  timeline: { orderBy: { occurredAt: "asc" as const } },
  prescriptions: true,
  calendarEvents: {
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, role: true } },
    },
  },
};
