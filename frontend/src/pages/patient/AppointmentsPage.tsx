import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppointmentCard } from "@/components/AppointmentCard";
import { CalendarParticipants } from "@/components/CalendarParticipants";
import { AppointmentStatusBadge, CalendarStatusBadge } from "@/components/DomainBadges";
import { EmptyState, PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { aiStatusCopy, NotificationStatusList, postVisitStatusCopy } from "@/components/SideEffectStatus";
import { StatusBadge } from "@/components/StatusBadge";
import { SlotGrid } from "@/components/SlotGrid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthContext";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { addDaysToInput, formatDateTime, toDateInputValue } from "@/lib/dates";
import type { AppointmentSummary, PublicSlot, SlotDay } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export function PatientAppointmentsPage() {
  const { data, error, loading } = useApi<AppointmentSummary[]>("/api/patient/appointments");
  return (
    <div>
      <PageHeader title="Appointments" description="Confirmed, held, and past visits." />
      {loading ? <SkeletonBlock className="h-40" /> : null}
      {error ? <QueryError message={error} /> : null}
      {!loading && data?.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="When you book, the visit will appear here with its timeline."
          actionLabel="Find a doctor"
          actionTo="/patient/doctors"
        />
      ) : (
        <div className="space-y-3">
          {data?.map((item) => (
            <AppointmentCard key={item.id} appointment={item} href={`/patient/appointments/${item.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PatientAppointmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token } = useAuth();
  const { data, error, loading, refetch } = useApi<AppointmentSummary>(
    id ? `/api/patient/appointments/${id}` : null,
  );
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const slotsPath =
    rescheduling && data && rescheduleDate
      ? `/api/patient/doctors/${data.doctor.id}/slots?date=${rescheduleDate}`
      : null;
  const { data: slotDay, error: slotError, loading: slotsLoading, refetch: refetchSlots } = useApi<SlotDay>(slotsPath);

  if (loading) return <SkeletonBlock className="h-64" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;

  const upcoming = new Date(data.startAt).getTime() > Date.now();
  const canCancel = upcoming && (data.status === "BOOKED" || data.status === "HELD");
  const canReschedule = upcoming && data.status === "BOOKED";

  async function runCancel() {
    if (!token || !id) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await apiRequest<AppointmentSummary>(`/api/patient/appointments/${id}/cancel`, {
        method: "POST",
        token,
      });
      if (updated.status === "CANCELLED" && data?.status === "HELD") {
        navigate("/patient/appointments");
        return;
      }
      setConfirmCancel(false);
      refetch();
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : "This appointment could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function runReschedule(slot: PublicSlot) {
    if (!token || !id) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await apiRequest<AppointmentSummary>(`/api/patient/appointments/${id}/reschedule`, {
        method: "POST",
        token,
        body: { startAt: slot.startAt },
      });
      setRescheduling(false);
      navigate(`/patient/appointments/${updated.id}`);
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : "That time is no longer available.");
      refetchSlots();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.doctor.name}
        description={`${data.doctor.specialization} · ${formatDateTime(data.startAt)}`}
      />
      <div className="flex flex-wrap gap-2">
        <AppointmentStatusBadge status={data.status} />
        <CalendarStatusBadge status={data.calendarSyncStatus} />
      </div>
      {data.status === "BOOKED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appointment confirmed</CardTitle>
            <CardDescription>
              This visit is stored in the clinic database. Email, AI briefing, and Google Calendar are optional and
              shown below. They never cancel a confirmed booking.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {actionError ? <QueryError message={actionError} /> : null}
      <CalendarParticipants participants={data.calendarParticipants} />
      {data.ai ? (
        <Card>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Pre-visit briefing</CardTitle>
              <CardDescription>{data.ai.disclaimer}</CardDescription>
            </div>
            <StatusBadge
              label={data.ai.status === "FAILED" ? "Unavailable" : data.ai.status}
              tone={
                data.ai.status === "READY"
                  ? "success"
                  : data.ai.status === "FAILED"
                    ? "warning"
                    : "info"
              }
            />
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{aiStatusCopy(data.ai.status, data.ai.error, "patient")}</p>
            {data.ai.status === "FAILED" || data.ai.status === "IDLE" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                OpenAI is optional. Your symptoms stay on the appointment either way.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <NotificationStatusList items={data.notifications} />

      {canCancel || canReschedule ? (
        <div className="flex flex-wrap gap-2">
          {canReschedule ? (
            <Button
              variant="outline"
              onClick={() => {
                setRescheduling(true);
                setConfirmCancel(false);
                setRescheduleDate(toDateInputValue(new Date(data.startAt)));
              }}
            >
              Reschedule
            </Button>
          ) : null}
          {canCancel ? (
            <Button variant="destructive" onClick={() => { setConfirmCancel(true); setRescheduling(false); }}>
              {data.status === "HELD" ? "Release hold" : "Cancel appointment"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {confirmCancel ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cancel this visit?</CardTitle>
            <CardDescription>
              {data.status === "HELD"
                ? "The reserved time will be released for someone else."
                : "The appointment will be cancelled and the time will open again."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={busy} onClick={() => void runCancel()}>
              {busy ? "Cancelling…" : data.status === "HELD" ? "Release time" : "Cancel visit"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmCancel(false)}>
              Keep appointment
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {rescheduling ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Choose a new time</CardTitle>
            <CardDescription>Your current visit stays until the new time is confirmed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reschedule-date">Date</Label>
              <input
                id="reschedule-date"
                type="date"
                min={toDateInputValue()}
                max={addDaysToInput(21)}
                className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm"
                value={rescheduleDate}
                onChange={(event) => setRescheduleDate(event.target.value)}
              />
            </div>
            {slotsLoading ? <SkeletonBlock className="h-24" /> : null}
            {slotError ? <QueryError message={slotError} /> : null}
            {slotDay ? (
              <SlotGrid
                slots={slotDay.slots}
                closed={slotDay.closed}
                onLeave={slotDay.onLeave}
                disabled={busy}
                onSelect={(slot) => void runReschedule(slot)}
              />
            ) : null}
            <Button variant="ghost" onClick={() => setRescheduling(false)}>
              Keep current time
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data.symptoms ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Symptoms you shared</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">{data.symptoms}</p>
          </CardContent>
        </Card>
      ) : null}
      {data.patientSummary ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">After your visit</CardTitle>
            <CardDescription>Written for you. This is not a diagnosis from CareFlow.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{data.patientSummary}</p>
            {data.followUpSteps && data.followUpSteps.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {data.followUpSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : data.postVisit && data.postVisit.status !== "IDLE" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">After your visit</CardTitle>
            <CardDescription>{data.postVisit.disclaimer}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed">
              {postVisitStatusCopy(data.postVisit.status, data.postVisit.error)}
            </p>
          </CardContent>
        </Card>
      ) : null}
      {data.prescriptions && data.prescriptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prescription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {data.prescriptions.map((rx) => (
              <div key={rx.id}>
                {rx.items.map((item) => (
                  <p key={`${rx.id}-${item.name}`}>
                    {item.name} · {item.dosage} · {item.frequency}
                    {item.duration ? ` · ${item.duration}` : ""}
                  </p>
                ))}
                {rx.notes ? <p className="mt-1 text-muted-foreground">{rx.notes}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">This is not a diagnosis or medical advice from CareFlow.</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <CareTimeline events={data.timeline ?? []} />
      <Link to="/patient/appointments" className="text-sm text-muted-foreground hover:text-foreground">
        Back to appointments
      </Link>
    </div>
  );
}

function CareTimeline({ events }: { events: Array<{ id: string; label: string; occurredAt: string }> }) {
  if (events.length === 0) return null;
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Care timeline</h2>
      <ol className="space-y-3 border-l border-border pl-4">
        {events.map((event) => (
          <li key={event.id}>
            <p className="text-sm font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function PatientMedicationsPage() {
  const { data, error, loading } = useApi<
    Array<{ id: string; medicationName: string; scheduleLabel: string; nextFireAt: string; isActive: boolean }>
  >("/api/patient/medications");

  return (
    <div>
      <PageHeader title="Medications" description="Reminders from your visits. They are not medical advice from CareFlow." />
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}
      {!loading && data?.length === 0 ? (
        <EmptyState title="No medication reminders" description="Reminders appear after a prescription is issued." />
      ) : (
        <ul className="space-y-3">
          {data?.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-card px-4 py-3">
              <p className="font-medium">{item.medicationName}</p>
              <p className="text-sm text-muted-foreground">{item.scheduleLabel}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
