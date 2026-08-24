import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { QueryError } from "@/components/Page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/auth/AuthContext";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import { calendarConnectionLabel } from "@/components/DomainBadges";

type CalendarStatus = {
  configured: boolean;
  connected: boolean;
  status: "CONNECTED" | "NOT_CONNECTED" | "UNAVAILABLE";
};

export function CalendarConnectionCard({
  connectPath,
  disconnectPath,
  statusPath,
}: {
  connectPath: string;
  disconnectPath: string;
  statusPath: string;
}) {
  const { token } = useAuth();
  const [params] = useSearchParams();
  const { data, error, loading, refetch } = useApi<CalendarStatus>(statusPath);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const calendarFlash = params.get("calendar");

  async function connectCalendar() {
    if (!token) return;
    setCalendarError(null);
    try {
      const result = await apiRequest<{ configured: boolean; url: string | null }>(connectPath, {
        method: "POST",
        token,
        body: { returnTo: window.location.origin },
      });
      if (!result.configured || !result.url) {
        setCalendarError("Google Calendar is not configured. Appointments remain valid without it.");
        return;
      }
      window.location.assign(result.url);
    } catch (caught) {
      setCalendarError(caught instanceof ApiRequestError ? caught.message : "Calendar could not be connected.");
    }
  }

  async function disconnectCalendar() {
    if (!token) return;
    setCalendarError(null);
    try {
      await apiRequest(disconnectPath, { method: "POST", token });
      refetch();
    } catch (caught) {
      setCalendarError(caught instanceof ApiRequestError ? caught.message : "Calendar could not be disconnected.");
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Google Calendar</CardTitle>
        <CardDescription>
          Optional. Connecting lets CareFlow add, update, and remove this visit on your calendar in the background.
          Booking still succeeds if Google is unavailable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {calendarFlash === "connected" ? (
          <p className="text-muted-foreground">Google Calendar connected. New visits will sync in the background.</p>
        ) : null}
        {calendarFlash === "error" ? (
          <QueryError message="Google Calendar could not be connected. Your appointments are unchanged." />
        ) : null}
        {calendarError ? <QueryError message={calendarError} /> : null}
        {error ? <QueryError message={error} /> : null}
        {loading && !data ? <p className="text-muted-foreground">Checking calendar status…</p> : null}
        {data ? (
          <>
            <p>
              Status: <span className="font-medium text-foreground">{calendarConnectionLabel(data.status)}</span>
            </p>
            {data.connected ? (
              <Button variant="outline" size="sm" onClick={() => void disconnectCalendar()}>
                Disconnect calendar
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => void connectCalendar()}>
                Connect Google Calendar
              </Button>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
