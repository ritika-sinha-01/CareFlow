import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AppointmentStatusBadge } from "@/components/DomainBadges";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import type { AppointmentSummary } from "@/lib/types";

export function AppointmentCard({
  appointment,
  href,
  subtitle,
}: {
  appointment: AppointmentSummary;
  href: string;
  subtitle?: string;
}) {
  return (
    <Link to={href} className="block">
      <Card className="transition-colors hover:border-primary/20 hover:bg-muted/30">
        <CardContent className="flex items-center gap-4 p-4">
          <div className="hidden w-[4.75rem] shrink-0 sm:block">
            <p className="text-lg font-semibold tracking-tight text-primary">{formatTime(appointment.startAt)}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {formatDate(appointment.startAt).split(",")[0]}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{subtitle ?? appointment.doctor.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">{appointment.doctor.specialization}</p>
            <p className="mt-1 text-sm text-muted-foreground sm:hidden">{formatDateTime(appointment.startAt)}</p>
          </div>
          <AppointmentStatusBadge status={appointment.status} />
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground/70 sm:block" aria-hidden="true" />
        </CardContent>
      </Card>
    </Link>
  );
}

export function NextVisitHero({
  appointment,
  href,
  kicker = "Next visit",
  person,
  extra,
}: {
  appointment: AppointmentSummary;
  href: string;
  kicker?: string;
  person?: string;
  extra?: ReactNode;
}) {
  return (
    <Link to={href} className="block">
      <Card className="overflow-hidden border-primary/15 bg-gradient-to-br from-card via-card to-secondary/60 transition-colors hover:border-primary/25">
        <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{kicker}</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-primary">{formatTime(appointment.startAt)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(appointment.startAt)}</p>
            <p className="mt-5 text-base font-medium">{person ?? appointment.doctor.name}</p>
            <p className="text-sm text-muted-foreground">{appointment.doctor.specialization}</p>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <AppointmentStatusBadge status={appointment.status} />
            {extra}
            <span className="text-sm font-medium text-primary">Open details</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
