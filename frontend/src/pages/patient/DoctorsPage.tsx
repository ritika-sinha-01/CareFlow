import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Avatar } from "@/components/Avatar";
import { EmptyState, PageHeader, QueryError, SkeletonBlock } from "@/components/Page";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime, WEEKDAYS } from "@/lib/dates";
import type { DoctorCard } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useApi } from "@/lib/use-api";

export function PatientDoctorsPage() {
  const [query, setQuery] = useState("");
  const { data, error, loading } = useApi<DoctorCard[]>("/api/patient/doctors");
  const specializations = useMemo(
    () => [...new Set((data ?? []).map((item) => item.specialization))].sort(),
    [data],
  );
  const [specialization, setSpecialization] = useState("");

  const filtered = (data ?? []).filter((doctor) => {
    const matchesQuery = `${doctor.name} ${doctor.specialization}`.toLowerCase().includes(query.toLowerCase());
    const matchesSpec = specialization ? doctor.specialization === specialization : true;
    return matchesQuery && matchesSpec;
  });

  return (
    <div>
      <PageHeader
        title="Find care"
        description="Search by name or specialization. Demo clinician profiles are labeled."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="doctor-search">Search</Label>
          <Input
            id="doctor-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cardiology, Sharma…"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="specialization">Specialization</Label>
          <select
            id="specialization"
            className="flex h-11 w-full rounded-lg border border-input bg-card px-3 text-sm"
            value={specialization}
            onChange={(event) => setSpecialization(event.target.value)}
          >
            <option value="">All</option>
            {specializations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </div>
      </div>
      {loading ? <SkeletonBlock className="h-40" /> : null}
      {error ? <QueryError message={error} /> : null}
      {!loading && filtered.length === 0 ? (
        <EmptyState title="No doctors match" description="Try another specialization or clear your search." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((doctor) => (
            <DoctorResult key={doctor.id} doctor={doctor} />
          ))}
        </div>
      )}
    </div>
  );
}

function DoctorResult({ doctor }: { doctor: DoctorCard }) {
  const hours = doctor.workingHours[0];
  return (
    <Card className="transition-colors hover:border-primary/20">
      <CardHeader>
        <div className="flex items-start gap-3">
          <Avatar name={doctor.name} className="h-11 w-11 text-sm" />
          <div className="min-w-0">
            <CardTitle>{doctor.name}</CardTitle>
            <CardDescription>
              {doctor.specialization}
              {doctor.isDemo ? " · Demo profile" : ""}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-muted-foreground">{doctor.bio}</p>
        <p className="text-sm text-muted-foreground">
          {hours ? `Weekdays ${hours.startTime}–${hours.endTime}` : "Hours on request"} · {doctor.slotDurationMin}-minute visits
        </p>
        {doctor.nextAvailableAt ? (
          <p className="inline-flex rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            Next {formatDateTime(doctor.nextAvailableAt)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No open times in the next two weeks</p>
        )}
        <Link to={`/patient/doctors/${doctor.id}`} className={cn(buttonVariants({ variant: "outline" }))}>
          View availability
        </Link>
      </CardContent>
    </Card>
  );
}

export function PatientDoctorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading } = useApi<DoctorCard>(id ? `/api/patient/doctors/${id}` : null);

  if (loading) return <SkeletonBlock className="h-48" />;
  if (error) return <QueryError message={error} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title={data.name}
        description={`${data.specialization}${data.isDemo ? " · Demo clinician profile, not a real clinician." : ""}`}
        action={
          <button
            type="button"
            className={cn(buttonVariants())}
            onClick={() => navigate(`/patient/book?doctorId=${data.id}`)}
          >
            Continue to book
          </button>
        }
      />
      {data.nextAvailableAt ? (
        <p className="mb-4 inline-flex rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
          Next {formatDateTime(data.nextAvailableAt)}
        </p>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">No open times in the next two weeks.</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Working hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.workingHours.map((item) => (
            <p key={item.weekday} className="text-sm text-muted-foreground">
              {WEEKDAYS[item.weekday]} · {item.startTime}–{item.endTime}
            </p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
