import { Link, useNavigate, useParams } from "react-router-dom";
import { useState, type FormEvent } from "react";
import { AppointmentCard } from "@/components/AppointmentCard";
import { NotificationStatusBadge } from "@/components/DomainBadges";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { AppointmentSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";
import { useAuth } from "@/auth/AuthContext";

type AdminDashboard = {
  totals: {
    doctors: number;
    patients: number;
    todayAppointments: number;
    upcomingAppointments: number;
    failedNotifications: number;
    leaveConflicts: number;
  };
  leaveConflicts: Array<{ leaveId: string; doctorName: string; affected: number }>;
  health: {
    status: string;
    components: Array<{ name: string; status: string; detail: string }>;
  };
  recentEvents: Array<{ id: string; type: string; message: string; createdAt: string }>;
};

function healthTone(status: string) {
  if (status === "OPERATIONAL") return "success" as const;
  if (status === "DEGRADED") return "warning" as const;
  return "danger" as const;
}

export function AdminDashboardPage() {
  const { data, error, loading } = useApi<AdminDashboard>("/api/admin/dashboard");
  if (loading) return <SkeletonBlock className="h-64" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;

  const stats = [
    ["Doctors", data.totals.doctors],
    ["Active patients", data.totals.patients],
    ["Today's appointments", data.totals.todayAppointments],
    ["Upcoming", data.totals.upcomingAppointments],
    ["Leave conflicts", data.totals.leaveConflicts],
    ["Failed notifications", data.totals.failedNotifications],
  ] as const;

  return (
    <div>
      <PageHeader title="Clinic overview" description="Live counts and service health. No decorative analytics." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border/80 bg-card px-4 py-4 shadow-soft">
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">System health</CardTitle>
          <StatusBadge label={data.health.status} tone={healthTone(data.health.status)} />
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {data.health.components.map((component) => (
            <div key={component.name} className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 px-3 py-3">
              <div>
                <p className="text-sm font-medium">{component.name.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{component.detail}</p>
              </div>
              <StatusBadge label={component.status} tone={healthTone(component.status)} />
            </div>
          ))}
        </CardContent>
      </Card>
      {data.leaveConflicts.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Leave conflicts</CardTitle>
            <CardDescription>Existing appointments overlap these leave dates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {data.leaveConflicts.map((item) => (
              <p key={item.leaveId}>
                {item.doctorName}: {item.affected} appointment{item.affected === 1 ? "" : "s"} affected
              </p>
            ))}
            <Link to="/admin/leave" className="font-medium underline-offset-4 hover:underline">
              Open leave center
            </Link>
          </CardContent>
        </Card>
      ) : null}
      <SimulationPanel />
      <section>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent system activity</h2>
        <ul className="space-y-2">
          {data.recentEvents.map((event) => (
            <li key={event.id} className="rounded-xl border border-border/80 bg-card px-3 py-2.5 text-sm shadow-soft">
              <span className="font-medium">{event.type.replaceAll("_", " ")}</span>
              <span className="text-muted-foreground"> — {event.message}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const simulationFlags = [
  { id: "AI", label: "AI briefing" },
  { id: "EMAIL", label: "Email delivery" },
  { id: "CALENDAR", label: "Google Calendar" },
  { id: "BOOKING_CONFLICT", label: "Booking conflict" },
  { id: "LEAVE_CONFLICT", label: "Leave resolution" },
] as const;

function SimulationPanel() {
  const { token } = useAuth();
  const { data, error, refetch } = useApi<{ enabled: boolean; activeFlags: string[] }>("/api/demo/simulation");
  const [busy, setBusy] = useState<string | null>(null);

  if (error || !data?.enabled) return null;

  async function toggle(flag: string, enabled: boolean) {
    if (!token) return;
    setBusy(flag);
    try {
      await apiRequest("/api/demo/simulation", { method: "POST", token, body: { flag, enabled } });
      refetch();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6 mt-6">
      <CardHeader>
        <CardTitle className="text-base">Demo failure simulation</CardTitle>
        <CardDescription>Admin-only. Booking still succeeds when AI, email, or calendar fail.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {simulationFlags.map((item) => {
          const on = data.activeFlags.includes(item.id);
          return (
            <Button
              key={item.id}
              size="sm"
              variant={on ? "destructive" : "outline"}
              disabled={busy === item.id}
              onClick={() => void toggle(item.id, !on)}
            >
              {item.label}
              {on ? " on" : " off"}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function AdminDoctorsPage() {
  const { data, error, loading } = useApi<
    Array<{ id: string; name: string; email: string; specialization: string; isDemo: boolean; slotDurationMin: number }>
  >("/api/admin/doctors");
  return (
    <div>
      <PageHeader
        title="Doctors"
        description="Clinic profiles. Demo clinicians are labeled."
        action={
          <Link to="/admin/doctors/new" className={cn(buttonVariants())}>
            Add doctor
          </Link>
        }
      />
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}
      <div className="grid gap-3 md:hidden">
        {data?.map((doctor) => (
          <Link key={doctor.id} to={`/admin/doctors/${doctor.id}`} className="rounded-md border border-border bg-card p-4">
            <p className="font-medium">{doctor.name}</p>
            <p className="text-sm text-muted-foreground">{doctor.specialization}</p>
          </Link>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 font-medium">Name</th>
              <th className="py-2 font-medium">Specialization</th>
              <th className="py-2 font-medium">Slot</th>
              <th className="py-2 font-medium">Email</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((doctor) => (
              <tr key={doctor.id} className="border-b border-border">
                <td className="py-3">
                  <Link to={`/admin/doctors/${doctor.id}`} className="font-medium hover:underline">
                    {doctor.name}
                  </Link>
                  {doctor.isDemo ? <span className="ml-2 text-xs text-muted-foreground">Demo</span> : null}
                </td>
                <td>{doctor.specialization}</td>
                <td>{doctor.slotDurationMin} min</td>
                <td className="text-muted-foreground">{doctor.email}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminDoctorNewPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    try {
      const created = await apiRequest<{ doctorId: string }>("/api/admin/doctors", {
        method: "POST",
        token,
        body: {
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          email: form.get("email"),
          password: form.get("password"),
          specialization: form.get("specialization"),
          slotDurationMin: Number(form.get("slotDurationMin")),
          yearsExperience: form.get("yearsExperience") ? Number(form.get("yearsExperience")) : undefined,
        },
      });
      navigate(`/admin/doctors/${created.doctorId}`);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Unable to create this profile.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="New doctor" description="Creates a sign-in and weekday hours of 09:00–17:00." />
      {error ? <QueryError message={error} /> : null}
      <form className="max-w-lg space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" required />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Temporary password</Label>
          <Input id="password" name="password" type="password" minLength={10} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="specialization">Specialization</Label>
          <Input id="specialization" name="specialization" required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="slotDurationMin">Slot duration (minutes)</Label>
            <Input id="slotDurationMin" name="slotDurationMin" type="number" defaultValue={30} min={10} max={120} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="yearsExperience">Years (optional)</Label>
            <Input id="yearsExperience" name="yearsExperience" type="number" min={0} />
          </div>
        </div>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Create profile"}
        </Button>
      </form>
    </div>
  );
}

export function AdminDoctorDetailPage() {
  const { id } = useParams();
  const { data, error, loading } = useApi<{
    specialization: string;
    bio: string | null;
    slotDurationMin: number;
    isDemo: boolean;
    user: { firstName: string; lastName: string; email: string };
    workingHours: Array<{ weekday: number; startTime: string; endTime: string }>;
  }>(id ? `/api/admin/doctors/${id}` : null);
  if (loading) return <SkeletonBlock className="h-40" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;
  return (
    <div>
      <PageHeader
        title={`${data.user.firstName} ${data.user.lastName}`}
        description={`${data.specialization}${data.isDemo ? " · Demo profile" : ""}`}
      />
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
          <p>{data.user.email}</p>
          <p>{data.bio}</p>
          <p>{data.slotDurationMin}-minute slots</p>
        </CardContent>
      </Card>
    </div>
  );
}

export function AdminAppointmentsPage() {
  const { data, error, loading } = useApi<AppointmentSummary[]>("/api/admin/appointments");
  return (
    <div>
      <PageHeader title="Appointments" description="Clinic-wide schedule." />
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}
      <div className="space-y-3">
        {data?.map((item) => (
          <AppointmentCard
            key={item.id}
            appointment={item}
            href={`/admin/appointments/${item.id}`}
            subtitle={`${item.patient?.name ?? "Unassigned"} · ${item.doctor.name}`}
          />
        ))}
      </div>
    </div>
  );
}

export function AdminAppointmentDetailPage() {
  const { id } = useParams();
  const { data, error, loading } = useApi<AppointmentSummary>(id ? `/api/admin/appointments/${id}` : null);
  if (loading) return <SkeletonBlock className="h-40" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;
  return (
    <div>
      <PageHeader title={data.patient?.name ?? "Appointment"} description={data.doctor.name} />
      <p className="text-sm text-muted-foreground">{data.symptoms}</p>
    </div>
  );
}

export function AdminLeavePage() {
  const { token } = useAuth();
  const { data, error, loading, refetch } = useApi<
    Array<{
      id: string;
      doctorId: string;
      doctorName: string;
      startDate: string;
      endDate: string;
      reason: string | null;
      affectedAppointments: number;
    }>
  >("/api/admin/leave");
  const { data: doctors } = useApi<Array<{ id: string; name: string }>>("/api/admin/doctors");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setFormError(null);
    try {
      await apiRequest("/api/admin/leave", {
        method: "POST",
        token,
        body: {
          doctorId: form.get("doctorId"),
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
      await apiRequest(`/api/admin/leave/${id}/resolve`, { method: "POST", token });
      refetch();
    } catch (caught) {
      setFormError(caught instanceof ApiRequestError ? caught.message : "Affected visits could not be released.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Leave"
        description="Recording leave does not silently delete visits. Overlaps are listed so you can notify patients and release the times."
      />
      {formError ? <div className="mb-4"><QueryError message={formError} /></div> : null}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Record leave</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={onCreate}>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="doctorId">Clinician</Label>
              <select id="doctorId" name="doctorId" required className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm">
                <option value="">Select</option>
                {doctors?.map((doctor) => (
                  <option key={doctor.id} value={doctor.id}>
                    {doctor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">From</Label>
              <Input id="startDate" name="startDate" type="date" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">To</Label>
              <Input id="endDate" name="endDate" type="date" required />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" name="reason" />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save leave"}
            </Button>
          </form>
        </CardContent>
      </Card>
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}
      {!loading && data?.length === 0 ? (
        <EmptyState title="No leave recorded" description="Leave dates will appear here." />
      ) : (
        <ul className="space-y-3">
          {data?.map((item) => (
            <li key={item.id} className="rounded-md border border-border bg-card px-4 py-3">
              <p className="font-medium">{item.doctorName}</p>
              <p className="text-sm text-muted-foreground">
                {formatDate(item.startDate)} – {formatDate(item.endDate)}
              </p>
              <p className="mt-1 text-sm">
                {item.affectedAppointments} appointment{item.affectedAppointments === 1 ? "" : "s"} affected
              </p>
              {item.affectedAppointments > 0 ? (
                <Button className="mt-3" size="sm" variant="outline" disabled={busy} onClick={() => void onResolve(item.id)}>
                  Notify and release visits
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AdminNotificationsPage() {
  const { data, error, loading } = useApi<
    Array<{
      id: string;
      type: string;
      status: string;
      toEmail: string;
      subject: string;
      retryCount: number;
      lastError: string | null;
    }>
  >("/api/admin/notifications");
  return (
    <div>
      <PageHeader title="Notification reliability" description="Queued, retrying, and failed delivery — not a cosmetic inbox." />
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}
      <ul className="space-y-3">
        {data?.map((item) => (
          <li key={item.id} className="rounded-md border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium">{item.subject}</p>
              <NotificationStatusBadge status={item.status} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {item.type.replaceAll("_", " ")} · {item.toEmail}
              {item.retryCount > 0 ? ` · retries ${item.retryCount}` : ""}
            </p>
            {item.lastError ? <p className="mt-1 text-xs text-muted-foreground">{item.lastError}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
