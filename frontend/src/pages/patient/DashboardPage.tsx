import { Link } from "react-router-dom";
import { AppointmentCard, NextVisitHero } from "@/components/AppointmentCard";
import { CalendarStatusBadge } from "@/components/DomainBadges";
import { EmptyState, PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { buttonVariants } from "@/components/ui/button";
import { useAuth } from "@/auth/AuthContext";
import { greetingForNow } from "@/lib/dates";
import type { AppointmentSummary, PublicUser } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";

type Dashboard = {
  user: PublicUser;
  nextAppointment: AppointmentSummary | null;
  upcoming: AppointmentSummary[];
  medications: Array<{ id: string; medicationName: string; scheduleLabel: string; nextFireAt: string }>;
  recentCare: AppointmentSummary[];
};

export function PatientDashboardPage() {
  const { user } = useAuth();
  const { data, error, loading } = useApi<Dashboard>("/api/patient/dashboard");

  if (loading) return <SkeletonBlock className="h-64" />;
  if (error) return <QueryError message={error} />;
  if (!data || !user) return null;

  return (
    <div>
      <PageHeader
        title={`${greetingForNow()}, ${user.firstName}`}
        description="Your next visit, medications, and recent care — in one place."
        action={
          <Link to="/patient/book" className={cn(buttonVariants())}>
            Book appointment
          </Link>
        }
      />

      {data.nextAppointment ? (
        <div className="mb-8">
          <NextVisitHero
            appointment={data.nextAppointment}
            href={`/patient/appointments/${data.nextAppointment.id}`}
            extra={<CalendarStatusBadge status={data.nextAppointment.calendarSyncStatus} />}
          />
        </div>
      ) : (
        <div className="mb-6">
          <EmptyState
            title="No upcoming appointments"
            description="Your next appointment will appear here."
            actionLabel="Find a doctor"
            actionTo="/patient/doctors"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Upcoming</h2>
          <div className="space-y-3">
            {data.upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled after today.</p>
            ) : (
              data.upcoming.map((item) => (
                <AppointmentCard key={item.id} appointment={item} href={`/patient/appointments/${item.id}`} />
              ))
            )}
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground">Medication reminders</h2>
          {data.medications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active reminders.</p>
          ) : (
            <ul className="space-y-3">
              {data.medications.map((item) => (
                <li key={item.id} className="rounded-xl border border-border/80 bg-card px-4 py-3 shadow-soft">
                  <p className="font-medium">{item.medicationName}</p>
                  <p className="text-sm text-muted-foreground">{item.scheduleLabel}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Recent care</h2>
        <div className="space-y-3">
          {data.recentCare.map((item) => (
            <AppointmentCard key={item.id} appointment={item} href={`/patient/appointments/${item.id}`} />
          ))}
        </div>
      </section>
    </div>
  );
}
