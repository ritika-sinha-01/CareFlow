import { useState, type FormEvent } from "react";
import { CalendarConnectionCard } from "@/components/CalendarConnectionCard";
import { PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest, ApiRequestError } from "@/lib/api";
import type { SessionPayload } from "@/lib/types";

export function PatientProfilePage() {
  const { user, token, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!user) return <SkeletonBlock className="h-40" />;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);
    setSaved(false);
    try {
      await apiRequest<SessionPayload>("/api/auth/profile", {
        method: "PATCH",
        token,
        body: {
          firstName: String(form.get("firstName")),
          lastName: String(form.get("lastName")),
          phone: String(form.get("phone")),
        },
      });
      await refresh();
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof ApiRequestError ? caught.message : "Unable to save.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="Profile" description={user.isDemo ? "Demo patient account." : "Your contact details."} />
      {error ? <QueryError message={error} /> : null}
      <CalendarConnectionCard
        connectPath="/api/patient/calendar/connect"
        disconnectPath="/api/patient/calendar/disconnect"
        statusPath="/api/patient/calendar/status"
      />
      <form className="max-w-md space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" name="firstName" defaultValue={user.firstName} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" name="lastName" defaultValue={user.lastName} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user.email} disabled />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={user.phone ?? ""} />
        </div>
        {saved ? <p className="text-sm text-success">Saved.</p> : null}
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </form>
    </div>
  );
}
