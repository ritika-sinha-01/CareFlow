import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationStatusBadge } from "@/components/DomainBadges";

export const HEALTH_LABELS: Record<string, string> = {
  DATABASE: "Database",
  APPOINTMENT_ENGINE: "Appointment booking",
  AI_SERVICE: "AI briefing (optional)",
  EMAIL_SERVICE: "Email notifications (optional)",
  BACKGROUND_WORKER: "Background jobs",
  GOOGLE_CALENDAR: "Google Calendar (optional)",
};

const OPTIONAL_HEALTH = new Set(["AI_SERVICE", "EMAIL_SERVICE", "GOOGLE_CALENDAR"]);

export function healthTone(status: string) {
  if (status === "OPERATIONAL" || status === "READY" || status === "SENT") return "success" as const;
  if (status === "DEGRADED" || status === "PENDING" || status === "RETRYING" || status === "QUEUED") {
    return "warning" as const;
  }
  return "danger" as const;
}

export function isOptionalHealthComponent(name: string) {
  return OPTIONAL_HEALTH.has(name);
}

export function aiStatusCopy(status: string | undefined, error: string | null | undefined, audience: "patient" | "doctor") {
  if (status === "READY") {
    return audience === "doctor"
      ? "Briefing ready. This is assistive only and is not a diagnosis."
      : "A briefing was prepared for your clinician. It is not a diagnosis.";
  }
  if (status === "PENDING" || status === "RETRYING") {
    return "A briefing is being prepared in the background. The appointment is already confirmed.";
  }
  if (status === "FAILED") {
    return (
      error ??
      "AI is unavailable or not configured. Original symptoms are preserved and the appointment is unchanged."
    );
  }
  return "No AI briefing is attached to this visit yet. Booking does not depend on AI.";
}

export function postVisitStatusCopy(status: string | undefined, error: string | null | undefined) {
  if (status === "READY") {
    return "A patient-friendly summary is ready. It is not a diagnosis.";
  }
  if (status === "PENDING" || status === "RETRYING") {
    return "A patient-facing summary is being prepared. Consultation notes and the appointment remain saved.";
  }
  if (status === "FAILED") {
    return (
      error ??
      "A summary could not be generated because AI is unavailable. Notes, prescriptions, and the appointment remain saved."
    );
  }
  return "Complete the visit to generate a patient-friendly summary. This uses AI only when it is configured.";
}

const NOTIFICATION_LABELS: Record<string, string> = {
  BOOKING_CONFIRMATION: "Booking confirmation email",
  CANCELLATION: "Cancellation email",
  RESCHEDULE: "Reschedule email",
  APPOINTMENT_REMINDER: "Appointment reminder",
  MEDICATION_REMINDER: "Medication reminder",
  LEAVE_AFFECTED: "Leave notice",
  POST_VISIT_SUMMARY: "Visit summary email",
};

export function notificationLabel(type: string) {
  return NOTIFICATION_LABELS[type] ?? type.replaceAll("_", " ").toLowerCase();
}

export function NotificationStatusList({
  items,
}: {
  items?: Array<{ id?: string; type: string; status: string }>;
}) {
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reminders and email</CardTitle>
          <CardDescription>
            Confirmation and reminder emails are queued after booking. If email is not configured they stay queued or
            failed and the visit remains valid.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Reminders and email</CardTitle>
        <CardDescription>
          Delivery is optional. A queued or failed email does not cancel the appointment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map((item, index) => (
          <div key={item.id ?? `${item.type}-${index}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>{notificationLabel(item.type)}</p>
            <NotificationStatusBadge status={item.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function HealthComponentRow({
  name,
  status,
  detail,
  optional,
}: {
  name: string;
  status: string;
  detail: string;
  optional?: boolean;
}) {
  const label = HEALTH_LABELS[name] ?? name.replaceAll("_", " ");
  const isOptional = optional ?? isOptionalHealthComponent(name);
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 px-3 py-3">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{detail}</p>
        {isOptional && status !== "OPERATIONAL" ? (
          <p className="mt-1 text-xs text-muted-foreground">Optional. Appointments still book and stay confirmed.</p>
        ) : null}
      </div>
      <StatusBadge label={status} tone={healthTone(status)} />
    </div>
  );
}
