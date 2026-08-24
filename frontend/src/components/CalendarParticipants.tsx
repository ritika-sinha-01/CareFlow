import { CalendarStatusBadge } from "@/components/DomainBadges";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CalendarParticipant } from "@/lib/types";

export function CalendarParticipants({ participants }: { participants?: CalendarParticipant[] }) {
  if (!participants || participants.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Calendar sync</CardTitle>
        <CardDescription>
          Google Calendar is optional. A failed or missing sync does not change this appointment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {participants.map((participant) => (
          <div key={participant.role} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>
              <span className="font-medium">{participant.role === "DOCTOR" ? "Clinician" : "Patient"}</span>
              {participant.name ? <span className="text-muted-foreground"> · {participant.name}</span> : null}
            </p>
            <CalendarStatusBadge status={participant.status} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
