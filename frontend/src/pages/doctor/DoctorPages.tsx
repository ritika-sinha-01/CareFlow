import { useParams } from "react-router-dom";
import { CalendarConnectionCard } from "@/components/CalendarConnectionCard";
import { CalendarParticipants } from "@/components/CalendarParticipants";
import { AppointmentCard, NextVisitHero } from "@/components/AppointmentCard";
import { AppointmentStatusBadge, CalendarStatusBadge, UrgencyBadge } from "@/components/DomainBadges";
import { EmptyState, PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { NotificationStatusList, postVisitStatusCopy } from "@/components/SideEffectStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { formatDateTime, formatDate, greetingForNow, WEEKDAYS } from "@/lib/dates";
import type { AppointmentSummary, PublicUser } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { useEffect, useState, type FormEvent } from "react";

type DoctorDashboard = {
  user: PublicUser;
  todayCount: number;
  nextAppointment: AppointmentSummary | null;
  urgency: { LOW: number; MEDIUM: number; HIGH: number };
  pendingConsultations: number;
  followUps: number;
  today: AppointmentSummary[];
  upcoming: AppointmentSummary[];
};

export function DoctorDashboardPage() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<DoctorDashboard>("/api/doctor/dashboard");
  if (loading) return <SkeletonBlock className="h-64" />;
  if (error) return <QueryError message={error} />;
  if (!data || !user) return null;

  return (
    <div>
      <PageHeader
        title={`${greetingForNow()}, Dr. ${user.lastName}`}
        description={`Today's appointments: ${data.todayCount}`}
      />
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Today's care overview</CardTitle>
          <CardDescription>Urgency is from the AI visit briefing. It is not a diagnosis.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <OverviewStat label="High urgency" value={data.urgency.HIGH} />
          <OverviewStat label="Medium urgency" value={data.urgency.MEDIUM} />
          <OverviewStat label="Low urgency" value={data.urgency.LOW} />
        </CardContent>
      </Card>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <p className="rounded-xl border border-border/80 bg-card px-4 py-3 text-sm shadow-soft">
          Pending notes: <span className="font-medium">{data.pendingConsultations}</span>
        </p>
        <p className="rounded-xl border border-border/80 bg-card px-4 py-3 text-sm shadow-soft">
          Follow-ups noted: <span className="font-medium">{data.followUps}</span>
        </p>
      </div>
      {data.nextAppointment ? (
        <div className="mb-8">
          <NextVisitHero
            appointment={data.nextAppointment}
            href={`/doctor/appointments/${data.nextAppointment.id}`}
            kicker="Next on the board"
            person={data.nextAppointment.patient?.name ?? "Patient"}
          />
        </div>
      ) : (
        <div className="mb-6">
          <EmptyState title="No visits on the board" description="Upcoming appointments will appear here." />
        </div>
      )}
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">Today</h2>
      <div className="space-y-3">
        {data.today.map((item) => (
          <AppointmentCard
            key={item.id}
            appointment={item}
            href={`/doctor/appointments/${item.id}`}
            subtitle={item.patient?.name ?? "Patient"}
          />
        ))}
      </div>
      {data.upcoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming</h2>
          <div className="space-y-3">
            {data.upcoming.map((item) => (
              <AppointmentCard
                key={item.id}
                appointment={item}
                href={`/doctor/appointments/${item.id}`}
                subtitle={item.patient?.name ?? "Patient"}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function OverviewStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/80 bg-muted/30 px-3 py-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function DoctorAppointmentsPage() {
  const { data, error, loading } = useApi<AppointmentSummary[]>("/api/doctor/appointments");
  return (
    <div>
      <PageHeader title="Appointments" description="Patients on your schedule." />
      {loading ? <SkeletonBlock className="h-40" /> : null}
      {error ? <QueryError message={error} /> : null}
      {!loading && !error && (data?.length ?? 0) === 0 ? (
        <EmptyState title="No appointments yet" description="When a patient books with you, the visit appears here from the database." />
      ) : null}
      <div className="space-y-3">
        {data?.map((item) => (
          <AppointmentCard
            key={item.id}
            appointment={item}
            href={`/doctor/appointments/${item.id}`}
            subtitle={item.patient?.name ?? "Patient"}
          />
        ))}
      </div>
    </div>
  );
}

export function DoctorAppointmentDetailPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const { data, error, loading, refetch } = useApi<AppointmentSummary>(id ? `/api/doctor/appointments/${id}` : null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  if (loading) return <SkeletonBlock className="h-64" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;

  async function retryBriefing() {
    if (!token || !id) return;
    setRetrying(true);
    setRetryError(null);
    try {
      await apiRequest(`/api/doctor/appointments/${id}/ai/retry`, { method: "POST", token });
      refetch();
    } catch (caught) {
      setRetryError(caught instanceof ApiRequestError ? caught.message : "Could not queue another briefing.");
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.patient?.name ?? "Patient"}
        description={`${formatDateTime(data.startAt)} · ${data.doctor.specialization}`}
      />
      <div className="flex flex-wrap gap-2">
        <AppointmentStatusBadge status={data.status} />
        <CalendarStatusBadge status={data.calendarSyncStatus} />
        {data.ai?.status === "READY" ? <UrgencyBadge urgency={data.ai.urgency ?? null} /> : null}
      </div>
      <CalendarParticipants participants={data.calendarParticipants} />
      <NotificationStatusList items={data.notifications} />
      {retryError ? <QueryError message={retryError} /> : null}
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <PreVisitBrief
          appointment={data}
          onRetry={() => void retryBriefing()}
          retrying={retrying}
        />
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>{data.patient?.name}</p>
            <p className="text-muted-foreground">{data.patient?.email}</p>
            <p className="text-muted-foreground">{data.patient?.phone ?? "No phone on file"}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Original symptoms</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed">{data.symptoms ?? "No symptoms recorded."}</p>
        </CardContent>
      </Card>
      <VisitWorkflow appointment={data} onSaved={refetch} />
      <ol className="space-y-3 border-l border-border pl-4">
        {(data.timeline ?? []).map((event) => (
          <li key={event.id}>
            <p className="text-sm font-medium">{event.label}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PreVisitBrief({
  appointment,
  onRetry,
  retrying,
}: {
  appointment: AppointmentSummary;
  onRetry: () => void;
  retrying: boolean;
}) {
  const ai = appointment.ai;
  const pending = ai?.status === "PENDING" || ai?.status === "RETRYING";
  const failed = !ai || ai.status === "FAILED" || ai.status === "IDLE";
  const ready = ai?.status === "READY";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pre-visit brief</CardTitle>
        <CardDescription>AI-generated visit briefing. Not a medical diagnosis.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {pending ? (
          <p className="text-sm text-muted-foreground">
            A briefing is being prepared. Original symptoms remain the source of truth. The appointment is already
            confirmed.
          </p>
        ) : null}
        {failed && !pending ? (
          <div>
            <p className="text-sm">
              {ai?.error ?? "A briefing is not available yet. Original symptoms are preserved."}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              OpenAI is optional. A missing or failed briefing does not change this appointment. You remain responsible
              for clinical judgment.
            </p>
            {ai?.status === "FAILED" ? (
              <Button className="mt-3" size="sm" variant="outline" disabled={retrying} onClick={onRetry}>
                {retrying ? "Queuing…" : "Retry briefing"}
              </Button>
            ) : null}
          </div>
        ) : null}
        {ready && ai ? (
          <>
            <UrgencyBadge urgency={ai.urgency ?? null} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Chief complaint</p>
              <p className="mt-1 text-sm">{ai.chiefComplaint}</p>
            </div>
            {ai.keySymptoms && ai.keySymptoms.length > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Key symptoms</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {ai.keySymptoms.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {ai.suggestedQuestions && ai.suggestedQuestions.length > 0 ? (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Suggested questions</p>
                <ol className="mt-1 list-decimal pl-5 text-sm">
                  {ai.suggestedQuestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">{ai.disclaimer}</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function emptyRxRow() {
  return { name: "", dosage: "", frequency: "", duration: "", instructions: "" };
}

function VisitWorkflow({
  appointment,
  onSaved,
}: {
  appointment: AppointmentSummary;
  onSaved: () => void;
}) {
  const { token } = useAuth();
  const booked = appointment.status === "BOOKED";
  const [notes, setNotes] = useState(appointment.clinicalNotes ?? "");
  const [rxRows, setRxRows] = useState([emptyRxRow()]);
  const [rxNotes, setRxNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setNotes(appointment.clinicalNotes ?? "");
  }, [appointment.clinicalNotes]);

  async function saveNotes() {
    if (!token) return;
    setBusy("notes");
    setError(null);
    try {
      await apiRequest(`/api/doctor/appointments/${appointment.id}/notes`, {
        method: "PATCH",
        token,
        body: { clinicalNotes: notes },
      });
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Notes could not be saved.");
    } finally {
      setBusy(null);
    }
  }

  async function issueRx() {
    if (!token) return;
    const items = rxRows
      .map((row) => ({
        name: row.name.trim(),
        dosage: row.dosage.trim(),
        frequency: row.frequency.trim(),
        duration: row.duration.trim() || undefined,
        instructions: row.instructions.trim() || undefined,
      }))
      .filter((row) => row.name && row.dosage && row.frequency);
    setBusy("rx");
    setError(null);
    try {
      await apiRequest(`/api/doctor/appointments/${appointment.id}/prescriptions`, {
        method: "POST",
        token,
        body: { items, notes: rxNotes.trim() || undefined },
      });
      setRxRows([emptyRxRow()]);
      setRxNotes("");
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "The prescription could not be issued.");
    } finally {
      setBusy(null);
    }
  }

  async function sendSummary() {
    if (!token) return;
    setBusy("summary");
    setError(null);
    try {
      await apiRequest(`/api/doctor/appointments/${appointment.id}/complete`, { method: "POST", token });
      onSaved();
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "The patient summary could not be queued.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {error ? <QueryError message={error} /> : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clinical notes</CardTitle>
          <CardDescription>Visible to the care team. Patients do not see these notes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!booked}
            placeholder="Assessment, plan, and anything the next clinician should know."
          />
          {booked ? (
            <Button size="sm" disabled={busy === "notes" || notes.trim().length < 12} onClick={() => void saveNotes()}>
              {busy === "notes" ? "Saving…" : "Save notes"}
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Prescription</CardTitle>
          <CardDescription>Issuing a prescription also creates a patient medication reminder. Demo data is not a real prescription.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(appointment.prescriptions ?? []).map((rx) => (
            <div key={rx.id} className="rounded-md border border-border px-3 py-3 text-sm">
              {rx.items.map((item) => (
                <p key={`${rx.id}-${item.name}`}>
                  {item.name} · {item.dosage} · {item.frequency}
                  {item.duration ? ` · ${item.duration}` : ""}
                </p>
              ))}
              {rx.notes ? <p className="mt-1 text-muted-foreground">{rx.notes}</p> : null}
            </div>
          ))}
          {booked ? (
            <>
              {rxRows.map((row, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Medicine</Label>
                    <Input value={row.name} onChange={(event) => {
                      const next = [...rxRows];
                      next[index] = { ...row, name: event.target.value };
                      setRxRows(next);
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label>Dose</Label>
                    <Input value={row.dosage} onChange={(event) => {
                      const next = [...rxRows];
                      next[index] = { ...row, dosage: event.target.value };
                      setRxRows(next);
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label>Frequency</Label>
                    <Input value={row.frequency} onChange={(event) => {
                      const next = [...rxRows];
                      next[index] = { ...row, frequency: event.target.value };
                      setRxRows(next);
                    }} />
                  </div>
                  <div className="space-y-1">
                    <Label>Duration</Label>
                    <Input value={row.duration} onChange={(event) => {
                      const next = [...rxRows];
                      next[index] = { ...row, duration: event.target.value };
                      setRxRows(next);
                    }} />
                  </div>
                </div>
              ))}
              <Label htmlFor="rx-notes">Internal note (optional)</Label>
              <Input id="rx-notes" value={rxNotes} onChange={(event) => setRxNotes(event.target.value)} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setRxRows((rows) => [...rows, emptyRxRow()])}>
                  Add medicine
                </Button>
                <Button size="sm" disabled={busy === "rx"} onClick={() => void issueRx()}>
                  {busy === "rx" ? "Issuing…" : "Issue prescription"}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Patient summary</CardTitle>
          <CardDescription>{appointment.postVisit?.disclaimer ?? "AI-assisted. Not a diagnosis."}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {appointment.postVisit?.status === "PENDING" || appointment.postVisit?.status === "RETRYING" ? (
            <p className="text-sm text-muted-foreground">
              {postVisitStatusCopy(appointment.postVisit.status, appointment.postVisit.error)}
            </p>
          ) : null}
          {appointment.postVisit?.status === "FAILED" ? (
            <div>
              <p className="text-sm">{postVisitStatusCopy(appointment.postVisit.status, appointment.postVisit.error)}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                OpenAI is optional. Notes and prescriptions stay on the record even if a summary cannot be generated.
              </p>
            </div>
          ) : null}
          {appointment.patientSummary ? (
            <p className="text-sm leading-relaxed">{appointment.patientSummary}</p>
          ) : null}
          {booked ? (
            <Button size="sm" disabled={busy === "summary"} onClick={() => void sendSummary()}>
              {busy === "summary" ? "Queuing…" : "Complete visit and generate summary"}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function DoctorPatientsPage() {
  const { data, error, loading } = useApi<Array<{ id: string; name: string; email: string; lastVisitAt: string }>>(
    "/api/doctor/patients",
  );
  return (
    <div>
      <PageHeader title="Patients" description="People who have booked with you." />
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}
      <ul className="space-y-3">
        {data?.map((item) => (
          <li key={item.id} className="rounded-md border border-border bg-card px-4 py-3">
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">{item.email}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DoctorProfilePage() {
  const { data, error, loading } = useApi<{
    user: PublicUser;
    doctor: {
      specialization: string;
      bio: string | null;
      slotDurationMin: number;
      isDemo: boolean;
      calendarConnected: boolean;
      workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
    };
  }>("/api/doctor/profile");

  if (loading) return <SkeletonBlock className="h-40" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader title="Profile" description={data.doctor.isDemo ? "Demo clinician profile." : "Your clinic profile."} />
      <CalendarConnectionCard
        connectPath="/api/doctor/calendar/connect"
        disconnectPath="/api/doctor/calendar/disconnect"
        statusPath="/api/doctor/calendar/status"
      />
      <Card>
        <CardHeader>
          <CardTitle>
            {data.user.firstName} {data.user.lastName}
          </CardTitle>
          <CardDescription>{data.doctor.specialization}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>{data.doctor.bio}</p>
          <p>Visit length: {data.doctor.slotDurationMin} minutes</p>
          {data.doctor.workingHours.map((item) => (
            <p key={item.weekday}>
              {WEEKDAYS[item.weekday]} · {item.startTime}–{item.endTime}
            </p>
          ))}
        </CardContent>
      </Card>
      <DoctorLeaveCard />
    </div>
  );
}

function DoctorLeaveCard() {
  const { token } = useAuth();
  const { data, error, loading, refetch } = useApi<
    Array<{
      id: string;
      startDate: string;
      endDate: string;
      reason: string | null;
      affectedAppointments: number;
    }>
  >("/api/doctor/leave");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFormError(null);
    try {
      await apiRequest("/api/doctor/leave", {
        method: "POST",
        token,
        body: {
          startDate: form.get("startDate"),
          endDate: form.get("endDate"),
          reason: form.get("reason") || undefined,
        },
      });
      event.currentTarget.reset();
      refetch();
    } catch (caught) {
      setFormError(caught instanceof ApiRequestError ? caught.message : "Leave could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function onResolve(id: string) {
    if (!token) return;
    setBusy(true);
    setFormError(null);
    try {
      await apiRequest(`/api/doctor/leave/${id}/resolve`, { method: "POST", token });
      refetch();
    } catch (caught) {
      setFormError(caught instanceof ApiRequestError ? caught.message : "Affected visits could not be released.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base">Leave</CardTitle>
        <CardDescription>
          Recording leave does not silently delete visits. Overlaps are listed so you can notify patients and release
          the times.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {formError ? <QueryError message={formError} /> : null}
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => void onCreate(event)}>
          <div className="space-y-2">
            <Label htmlFor="doctor-leave-start">From</Label>
            <Input id="doctor-leave-start" name="startDate" type="date" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="doctor-leave-end">To</Label>
            <Input id="doctor-leave-end" name="endDate" type="date" required />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="doctor-leave-reason">Reason (optional)</Label>
            <Input id="doctor-leave-reason" name="reason" />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save leave"}
          </Button>
        </form>
        {loading ? <SkeletonBlock className="h-20" /> : null}
        {error ? <QueryError message={error} /> : null}
        {data?.map((item) => (
          <div key={item.id} className="rounded-md border border-border px-3 py-3 text-sm">
            <p>
              {formatDate(item.startDate)} – {formatDate(item.endDate)}
              {item.reason ? ` · ${item.reason}` : ""}
            </p>
            <p className="mt-1 text-muted-foreground">
              {item.affectedAppointments} appointment{item.affectedAppointments === 1 ? "" : "s"} affected
            </p>
            {item.affectedAppointments > 0 ? (
              <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void onResolve(item.id)}>
                Notify and release visits
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
