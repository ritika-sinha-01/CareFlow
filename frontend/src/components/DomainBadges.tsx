import { StatusBadge } from "@/components/StatusBadge";

export function AppointmentStatusBadge({ status }: { status: string }) {
  if (status === "BOOKED") return <StatusBadge label="Confirmed" tone="success" />;
  if (status === "COMPLETED") return <StatusBadge label="Completed" tone="success" />;
  if (status === "HELD") return <StatusBadge label="Held" tone="warning" />;
  if (status === "CANCELLED") return <StatusBadge label="Cancelled" tone="neutral" />;
  if (status === "EXPIRED") return <StatusBadge label="Hold expired" tone="neutral" />;
  if (status === "BLOCKED") return <StatusBadge label="Unavailable" tone="danger" />;
  return <StatusBadge label={status} />;
}

export function NotificationStatusBadge({ status }: { status: string }) {
  if (status === "SENT") return <StatusBadge label="Sent" tone="success" />;
  if (status === "QUEUED") return <StatusBadge label="Queued" tone="info" />;
  if (status === "PROCESSING") return <StatusBadge label="Sending" tone="info" />;
  if (status === "RETRYING") return <StatusBadge label="Retrying" tone="warning" />;
  if (status === "FAILED") return <StatusBadge label="Failed" tone="danger" />;
  return <StatusBadge label={status} />;
}

export function UrgencyBadge({ urgency }: { urgency: string | null }) {
  if (urgency === "HIGH") return <StatusBadge label="High urgency" tone="danger" />;
  if (urgency === "MEDIUM") return <StatusBadge label="Medium urgency" tone="warning" />;
  if (urgency === "LOW") return <StatusBadge label="Low urgency" tone="success" />;
  return <StatusBadge label="Urgency pending" />;
}

export function calendarConnectionLabel(status: string): string {
  if (status === "CONNECTED" || status === "SYNCED") return "Connected";
  if (status === "NOT_CONNECTED") return "Not connected";
  if (status === "FAILED" || status === "RETRYING") return "Sync failed";
  if (status === "PENDING") return "Pending";
  return "Unavailable";
}

export function CalendarStatusBadge({ status }: { status: string }) {
  if (status === "SYNCED" || status === "CONNECTED") return <StatusBadge label="Connected" tone="success" />;
  if (status === "PENDING") return <StatusBadge label="Calendar pending" tone="warning" />;
  if (status === "RETRYING") return <StatusBadge label="Sync failed" tone="warning" />;
  if (status === "FAILED") return <StatusBadge label="Sync failed" tone="danger" />;
  if (status === "NOT_CONNECTED") return <StatusBadge label="Not connected" tone="neutral" />;
  return <StatusBadge label="Unavailable" tone="neutral" />;
}
