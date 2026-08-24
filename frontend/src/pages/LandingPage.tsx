import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Shield, Stethoscope, UserRound } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { StatusBadge } from "@/components/StatusBadge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiGet } from "@/lib/api";
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
    description: "Find a clinician, hold a slot, and follow care from booking through follow-up.",
    icon: UserRound,
  },
  {
    title: "Doctor",
    description: "Start the day with a briefing, write notes, and close the visit with a patient summary.",
    icon: Stethoscope,
  },
  {
    title: "Admin",
    description: "Manage schedules, leave conflicts, and notification reliability from one place.",
    icon: Shield,
  },
];

const mockSlots = [
  { time: "09:00", state: "Booked" },
  { time: "09:30", state: "Available" },
  { time: "10:00", state: "Held" },
  { time: "10:30", state: "Available" },
  { time: "11:00", state: "Available" },
  { time: "11:30", state: "Booked" },
];

function healthTone(status: HealthStatus) {
  if (status === "OPERATIONAL") return "success" as const;
  if (status === "DEGRADED") return "warning" as const;
  return "danger" as const;
}

export function LandingPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiGet<HealthPayload>("/api/health")
      .then((data) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => {
        if (!cancelled) setHealthError("The API is not reachable yet.");
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
            <StatusBadge label="Demo environment" tone="info" />
            <Link to="/login" className={cn(buttonVariants({ size: "sm" }))}>
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Healthcare appointments, without the noise
            </p>
            <h1 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight text-foreground md:text-6xl md:leading-[1.05]">
              Care, scheduled with clarity.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              CareFlow holds real slots, prevents double-booking, and keeps AI, email, and calendar as side effects.
              If an integration fails, the appointment still stands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login" className={cn(buttonVariants({ size: "lg" }))}>
                Sign in
              </Link>
              <Link to="/register" className={cn(buttonVariants({ variant: "outline", size: "lg" }))}>
                Create patient account
              </Link>
            </div>
          </div>

          <Card className="relative overflow-hidden" aria-hidden="true">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-secondary/70 to-transparent" />
            <CardHeader>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Tuesday · Cardiology
              </p>
              <CardTitle>Dr. Ananya Sharma</CardTitle>
              <CardDescription>30-minute visits · occupancy is the source of truth</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2">
                {mockSlots.map((slot) => (
                  <div
                    key={slot.time}
                    className={cn(
                      "rounded-xl border px-3 py-3",
                      slot.state === "Available" && "border-success/30 bg-success/10",
                      slot.state === "Held" && "border-warning/30 bg-warning/5",
                      slot.state === "Booked" && "border-border bg-muted/70",
                    )}
                  >
                    <p className="text-sm font-semibold">{slot.time}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{slot.state}</p>
                  </div>
                ))}
              </div>
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
                <Link to="/login" className="pt-2 text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Continue
                </Link>
              </CardHeader>
            </Card>
          ))}
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
            These checks are live. Calendar and email can be unavailable without invalidating appointments.
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
                <StatusBadge label={health.status} tone={healthTone(health.status)} />
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {health.components.map((component) => (
                  <div
                    key={component.name}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/80 bg-muted/30 px-3 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{component.name.replaceAll("_", " ")}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{component.detail}</p>
                    </div>
                    <StatusBadge label={component.status} tone={healthTone(component.status)} />
                  </div>
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
