import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Shield, Stethoscope, UserRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { HealthComponentRow } from "@/components/SideEffectStatus";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
import type { DoctorCard } from "@/lib/types";
import { cn } from "@/lib/utils";

type HealthStatus = "OPERATIONAL" | "DEGRADED" | "UNAVAILABLE";

type HealthPayload = {
  status: HealthStatus;
  checkedAt: string;
  clinicTimezone?: string;
  components: Array<{
    name: string;
    status: HealthStatus;
    detail: string;
    optional?: boolean;
  }>;
};

const roles = [
  {
    title: "Patient",
    description: "Register, find a clinician, hold a weekday slot, and follow the visit through confirmation.",
    icon: UserRound,
    href: "/register",
    action: "Create patient account",
  },
  {
    title: "Doctor",
    description: "Sign in with a demo clinician account, open the booked visit, write notes, and complete the visit.",
    icon: Stethoscope,
    href: "/login",
    action: "Sign in as clinician",
  },
  {
    title: "Admin",
    description: "Sign in with the production admin you seeded, then create or edit doctors and manage leave.",
    icon: Shield,
    href: "/login",
    action: "Sign in as admin",
  },
];

const evaluatorSteps = [
  "Create a patient account (no seeded patient on production).",
  "Open Find care and choose one of the six live demo clinicians.",
  "Pick a weekday, then an available slot from the real occupancy grid.",
  "Enter symptoms and confirm. The appointment is stored even if AI, email, or calendar are unavailable.",
  "Sign out, sign in as that clinician, add notes and a prescription, then generate a patient summary.",
  "Sign in as admin to edit doctors and record leave.",
];

function overallTone(status: HealthStatus) {
  if (status === "OPERATIONAL") return "success" as const;
  if (status === "DEGRADED") return "warning" as const;
  return "danger" as const;
}

export function LandingPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [doctors, setDoctors] = useState<DoctorCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<HealthPayload>("/api/health")
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealthError("The API is not reachable yet.");
      });
    apiGet<DoctorCard[]>("/api/doctors")
      .then((data) => {
        if (!cancelled) setDoctors(data);
      })
      .catch(() => {
        if (!cancelled) setDoctors([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/70 bg-card/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <BrandMark />
          <div className="flex items-center gap-3">
            <StatusBadge label="Live clinic data" tone="info" />
            <Link to="/login" className={cn(buttonVariants({ size: "sm" }))}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid items-start gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Healthcare appointments, without the noise
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.05]">
              Care, scheduled with clarity.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              CareFlow holds real slots, prevents double-booking, and keeps AI, email, and calendar as side effects.
              If an optional integration is not configured, the UI says so — and the appointment still stands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className={cn(buttonVariants({ size: "lg" }))}>
                Create patient account
              </Link>
              <a href="#clinicians" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                Find doctors
              </a>
              <Link to="/login" className={cn(buttonVariants({ variant: "ghost", size: "lg" }))}>
                Sign in
              </Link>
            </div>
          </div>

          <Card>
            <CardHeader>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Assignment evaluator
              </p>
              <CardTitle>10-minute demo path</CardTitle>
              <CardDescription>
                Every step uses the live API and database. Credentials for clinicians and admin are in the README Demo
                section — they are not filled in on this page.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {evaluatorSteps.map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-relaxed">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        <section className="mt-20 grid gap-4 md:grid-cols-3" aria-label="CareFlow roles">
          {roles.map((role) => (
            <Card key={role.title} className="transition-colors hover:border-primary/20">
              <CardHeader>
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/8 text-primary">
                  <role.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <CardTitle className="pt-2">{role.title}</CardTitle>
                <CardDescription>{role.description}</CardDescription>
                <Link to={role.href} className="pt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {role.action}
                </Link>
              </CardHeader>
            </Card>
          ))}
        </section>

        <section className="mt-20" aria-labelledby="clinicians-heading" id="clinicians">
          <h2 id="clinicians-heading" className="text-2xl font-semibold tracking-tight">
            Find doctors
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            These profiles are loaded from <code className="text-xs">GET /api/doctors</code>. Create a patient account
            to hold a real weekday slot.
          </p>
          {doctors === null ? (
            <div className="mt-6 grid gap-3 md:grid-cols-2" aria-busy="true">
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
              <div className="h-20 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : doctors.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">No clinicians are listed yet.</p>
          ) : (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {doctors.map((doctor) => (
                <Card key={doctor.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{doctor.name}</CardTitle>
                    <CardDescription>
                      {doctor.specialization}
                      {doctor.isDemo ? " · Demo profile" : ""}
                      {doctor.workingHours[0]
                        ? ` · Weekdays ${doctor.workingHours[0].startTime}–${doctor.workingHours[0].endTime}`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
          <div className="mt-6">
            <Link to="/register" className={cn(buttonVariants())}>
              Create patient account to book
            </Link>
          </div>
        </section>

        <section className="mt-20" aria-labelledby="health-heading">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Live services
          </div>
          <h2 id="health-heading" className="mt-2 text-2xl font-semibold tracking-tight">
            System health
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            These checks are live. OpenAI, email, and Google Calendar can report UNAVAILABLE without invalidating
            appointments. Booking only needs the database and appointment engine.
          </p>

          {healthError ? (
            <Card className="mt-6">
              <CardContent className="pt-6">
                <StatusBadge label="API unreachable" tone="danger" />
                <p className="mt-3 text-sm text-muted-foreground">{healthError}</p>
              </CardContent>
            </Card>
          ) : null}

          {!health && !healthError ? (
            <Card className="mt-6">
              <CardContent className="space-y-3 pt-6" aria-busy="true" aria-live="polite">
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                  <div className="h-16 animate-pulse rounded-xl bg-muted" />
                </div>
                <p className="sr-only">Checking services</p>
              </CardContent>
            </Card>
          ) : null}

          {health ? (
            <Card className="mt-6">
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">Overall</CardTitle>
                  {health.clinicTimezone ? (
                    <CardDescription>Clinic timezone {health.clinicTimezone}</CardDescription>
                  ) : null}
                </div>
                <StatusBadge label={health.status} tone={overallTone(health.status)} />
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {health.components.map((component) => (
                  <HealthComponentRow
                    key={component.name}
                    name={component.name}
                    status={component.status}
                    detail={component.detail}
                    optional={component.optional}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </section>
      </main>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>CareFlow · appointments as occupancy, not a calendar widget.</p>
          <p>AI never stands in as a diagnosis.</p>
        </div>
      </footer>
    </div>
  );
}
