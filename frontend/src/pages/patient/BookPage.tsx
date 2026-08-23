import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EmptyState, PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { SlotGrid } from "@/components/SlotGrid";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/auth/AuthContext";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { addDaysToInput, formatDateTime, formatRemaining, toDateInputValue } from "@/lib/dates";
import type { AppointmentSummary, DoctorCard, PublicSlot, SlotDay } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";

const steps = ["Doctor", "Date", "Slot", "Symptoms", "Review", "Confirm"];

export function PatientBookPage() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("doctorId");
  const { data: doctors, error, loading } = useApi<DoctorCard[]>("/api/patient/doctors");
  const selected = useMemo(() => doctors?.find((item) => item.id === selectedId) ?? null, [doctors, selectedId]);

  const [date, setDate] = useState("");
  const [step, setStep] = useState(selectedId ? 1 : 0);
  const [hold, setHold] = useState<AppointmentSummary | null>(null);
  const [symptoms, setSymptoms] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const holdRef = useRef<AppointmentSummary | null>(null);
  const confirmedRef = useRef(false);
  const expiringRef = useRef(false);

  holdRef.current = hold;

  const slotsPath = selected && date ? `/api/patient/doctors/${selected.id}/slots?date=${date}` : null;
  const { data: slotDay, error: slotError, loading: slotsLoading, refetch: refetchSlots } = useApi<SlotDay>(slotsPath);

  useEffect(() => {
    if (selected?.nextAvailableAt && !date) {
      setDate(toDateInputValue(new Date(selected.nextAvailableAt)));
      setStep((current) => Math.max(current, 2));
    }
  }, [selected, date]);

  useEffect(() => {
    if (selectedId) setStep((current) => Math.max(current, 1));
  }, [selectedId]);

  useEffect(() => {
    return () => {
      const current = holdRef.current;
      if (confirmedRef.current || !current || current.status !== "HELD" || !token) return;
      void apiRequest(`/api/patient/appointments/${current.id}/release`, { method: "POST", token }).catch(() => undefined);
    };
  }, [token]);

  async function dropHold() {
    const current = holdRef.current;
    if (!current || !token || current.status !== "HELD") {
      setHold(null);
      return;
    }
    try {
      await apiRequest(`/api/patient/appointments/${current.id}/release`, { method: "POST", token });
    } catch {
      // Already expired or released.
    }
    holdRef.current = null;
    setHold(null);
    setRemaining(null);
    expiringRef.current = false;
  }

  async function onHoldExpired() {
    await dropHold();
    setStep(2);
    setActionError("Your reservation expired. Please choose a time again.");
    refetchSlots();
  }

  useEffect(() => {
    if (!hold?.holdExpiresAt || hold.status !== "HELD") {
      setRemaining(null);
      return;
    }
    const tick = () => {
      const seconds = Math.max(0, Math.floor((new Date(hold.holdExpiresAt!).getTime() - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds <= 0 && !expiringRef.current) {
        expiringRef.current = true;
        void onHoldExpired();
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [hold?.id, hold?.holdExpiresAt, hold?.status]);

  async function chooseDoctor(doctorId: string) {
    if (hold) await dropHold();
    setDate("");
    setSymptoms("");
    setActionError(null);
    setStep(1);
    setParams({ doctorId });
  }

  async function onDateChange(next: string) {
    if (hold) await dropHold();
    setDate(next);
    setActionError(null);
    setStep(2);
  }

  async function onSelectSlot(slot: PublicSlot) {
    if (!selected || !token) return;
    if (hold && hold.startAt === slot.startAt && hold.status === "HELD") {
      setStep(3);
      return;
    }
    setBusy(true);
    setActionError(null);
    try {
      const reserved = await apiRequest<AppointmentSummary>("/api/patient/holds", {
        method: "POST",
        token,
        body: { doctorId: selected.id, startAt: slot.startAt },
      });
      setHold(reserved);
      setStep(3);
      refetchSlots();
    } catch (caught) {
      setActionError(caught instanceof ApiRequestError ? caught.message : "This time is no longer available.");
      refetchSlots();
    } finally {
      setBusy(false);
    }
  }

  async function confirmBooking() {
    if (!hold || !token) return;
    setBusy(true);
    setActionError(null);
    setStep(5);
    try {
      const booked = await apiRequest<AppointmentSummary>(`/api/patient/appointments/${hold.id}/confirm`, {
        method: "POST",
        token,
        body: { symptoms },
      });
      confirmedRef.current = true;
      holdRef.current = booked;
      setHold(booked);
      navigate(`/patient/appointments/${booked.id}`);
    } catch (caught) {
      setStep(4);
      setActionError(caught instanceof ApiRequestError ? caught.message : "Could not confirm this appointment.");
      if (caught instanceof ApiRequestError && caught.code === "HOLD_EXPIRED") {
        await onHoldExpired();
      }
    } finally {
      setBusy(false);
    }
  }

  const visualStep = busy && step === 5 ? 5 : Math.min(step, 4);
  const canReview = symptoms.trim().length >= 8 && hold?.status === "HELD";

  return (
    <div>
      <PageHeader
        title="Book an appointment"
        description="Choose a clinician and time. CareFlow holds the slot for five minutes while you confirm."
      />
      <ol className="mb-8 flex items-center gap-1 overflow-x-auto pb-1">
        {steps.map((label, index) => (
          <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                index <= visualStep ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {index + 1}
            </span>
            <span className={cn("hidden truncate text-xs sm:inline", index <= visualStep ? "font-medium" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {hold?.status === "HELD" && remaining != null ? (
        <div
          className={cn(
            "mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/5 px-4 py-3 text-sm",
            remaining <= 60 && "motion-safe:animate-pulse",
          )}
        >
          <p>
            Time held until {formatDateTime(hold.startAt)}. Remaining {formatRemaining(remaining)}.
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await dropHold();
              setStep(2);
              refetchSlots();
            }}
          >
            Cancel hold
          </Button>
        </div>
      ) : null}

      {actionError ? <div className="mb-4"><QueryError message={actionError} /></div> : null}
      {loading ? <SkeletonBlock className="h-32" /> : null}
      {error ? <QueryError message={error} /> : null}

      {!selected ? (
        <div className="grid gap-3">
          {(doctors ?? []).length === 0 && !loading ? (
            <EmptyState title="No clinicians listed" description="Ask an administrator to add doctor profiles." />
          ) : (
            (doctors ?? []).map((doctor) => (
              <button key={doctor.id} type="button" className="block w-full text-left" onClick={() => void chooseDoctor(doctor.id)}>
                <Card className="transition-colors hover:border-primary/20 hover:bg-muted/30">
                  <CardHeader>
                    <CardTitle className="text-base">{doctor.name}</CardTitle>
                    <CardDescription>
                      {doctor.specialization}
                      {doctor.isDemo ? " · Demo" : ""}
                      {doctor.nextAvailableAt ? ` · Next ${formatDateTime(doctor.nextAvailableAt)}` : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </button>
            ))
          )}
        </div>
      ) : null}

      {selected && step >= 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{selected.name}</CardTitle>
            <CardDescription>
              {selected.specialization}
              {selected.nextAvailableAt ? ` · Next available ${formatDateTime(selected.nextAvailableAt)}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {step >= 1 ? (
              <div className="space-y-2">
                <Label htmlFor="visit-date">Preferred date</Label>
                <input
                  id="visit-date"
                  type="date"
                  min={toDateInputValue()}
                  max={addDaysToInput(21)}
                  className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm font-normal"
                  value={date}
                  onChange={(event) => void onDateChange(event.target.value)}
                />
              </div>
            ) : null}

            {step >= 2 && date ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-medium">Choose a time</h2>
                  {slotDay ? <p className="text-xs text-muted-foreground">{slotDay.slotDurationMin}-minute visits</p> : null}
                </div>
                {slotsLoading ? <SkeletonBlock className="h-24" /> : null}
                {slotError ? <QueryError message={slotError} /> : null}
                {slotDay ? (
                  <SlotGrid
                    slots={slotDay.slots}
                    closed={slotDay.closed}
                    onLeave={slotDay.onLeave}
                    selectedStartAt={hold?.startAt}
                    disabled={busy}
                    onSelect={(slot) => void onSelectSlot(slot)}
                  />
                ) : null}
              </div>
            ) : null}

            {step >= 3 && hold ? (
              <div className="space-y-2">
                <Label htmlFor="symptoms">Symptoms</Label>
                <Textarea
                  id="symptoms"
                  value={symptoms}
                  onChange={(event) => setSymptoms(event.target.value)}
                  placeholder="What should the clinician know before this visit?"
                />
                <p className="text-xs text-muted-foreground">At least a short description — this is not a diagnosis.</p>
                {step === 3 ? (
                  <Button disabled={symptoms.trim().length < 8} onClick={() => setStep(4)}>
                    Continue to review
                  </Button>
                ) : null}
              </div>
            ) : null}

            {step >= 4 && hold ? (
              <div className="space-y-3 rounded-xl border border-border/80 bg-muted/30 px-4 py-4">
                <h2 className="text-sm font-medium">Review</h2>
                <p className="text-sm">{selected.name} · {selected.specialization}</p>
                <p className="text-sm text-muted-foreground">{formatDateTime(hold.startAt)}</p>
                <p className="text-sm leading-relaxed">{symptoms}</p>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={!canReview || busy} onClick={() => void confirmBooking()}>
                    {busy ? "Confirming…" : "Confirm appointment"}
                  </Button>
                  <Button variant="outline" disabled={busy} onClick={() => setStep(3)}>
                    Edit symptoms
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={cn(buttonVariants({ variant: "ghost" }))}
                onClick={async () => {
                  await dropHold();
                  setStep(0);
                  setParams({});
                }}
              >
                Choose a different doctor
              </button>
              <Link to="/patient/doctors" className={cn(buttonVariants({ variant: "ghost" }))}>
                Back to directory
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
