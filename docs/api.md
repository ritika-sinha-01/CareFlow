# CareFlow API

All JSON responses use:

```json
{ "success": true, "data": { } }
```

or

```json
{ "success": false, "error": { "code": "SLOT_UNAVAILABLE", "message": "…" } }
```

Base path: `/api`. Authenticated routes send `Authorization: Bearer <jwt>`.

## Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Diagnostic rollup. Components `OPERATIONAL` / `DEGRADED` / `UNAVAILABLE`. Includes `clinicTimezone`. AI, email, and calendar are `optional: true`. 503 only when overall status is `UNAVAILABLE`. Worker down is `DEGRADED`, not a failed liveness check. |
| GET | `/health/live` | Process is alive. Does not check database, worker, AI, email, or calendar. Always 200 while the API process is running. |
| GET | `/health/ready` | Database reachable and occupancy unique index present. 503 if either required dependency is down. Does **not** require worker, AI, email, or Google Calendar. |
| GET | `/doctors` | Public clinician directory. Returns `id`, `name`, `specialization`, `bio`, `slotDurationMin`, `yearsExperience`, `isDemo`, `workingHours`, `nextAvailableAt`. No emails, password hashes, or internal user ids. |
| GET | `/internal/worker/tick` | Vercel Cron / operator. `Authorization: Bearer $CRON_SECRET`. Runs one background-job tick. 401 if the secret is missing or wrong. |
| POST | `/auth/register` | Patient only. Rate-limited. |
| POST | `/auth/login` | Rate-limited. |
| GET | `/auth/me` | Current session. |
| PATCH | `/auth/profile` | Name/phone. |

## Patient (`requireRole PATIENT`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/patient/doctors` | Authenticated directory + next available slot. Same public fields as `GET /doctors`. |
| GET | `/patient/doctors/:id` | Profile. |
| GET | `/patient/doctors/:id/slots?date=YYYY-MM-DD` | Civil date in clinic timezone. Returns UTC `startAt` ISO strings, `clinicTimezone`, hold remaining seconds. |
| POST | `/patient/holds` | Body `{ doctorId, startAt }`. 201 or 409 `SLOT_UNAVAILABLE` / `DOCTOR_ON_LEAVE`. |
| POST | `/patient/appointments/:id/confirm` | Body `{ symptoms }`. 409 `HOLD_EXPIRED` if the hold lapsed. |
| POST | `/patient/appointments/:id/release` | Drop a hold. |
| POST | `/patient/appointments/:id/cancel` | Future booked visit or hold. |
| POST | `/patient/appointments/:id/reschedule` | Body `{ startAt }`. Same row, new occupancy key. |
| GET | `/patient/appointments` | Own visits. |
| GET | `/patient/appointments/:id` | 404 if not owned. Includes `calendarParticipants`, patient-safe AI status, and this patient’s notification rows. |
| GET | `/patient/medications` | Active medication reminders from prescriptions. |
| POST | `/patient/calendar/connect` | Own Google OAuth URL. Body `{ returnTo? }`. Tokens never returned. |
| GET | `/patient/calendar/callback` | Public OAuth redirect alias. |
| POST | `/patient/calendar/disconnect` | Clears **this** patient’s stored refresh token. |
| GET | `/patient/calendar/status` | `{ configured, connected, status }` (`CONNECTED` / `NOT_CONNECTED` / `UNAVAILABLE`). |

## Doctor (`requireRole DOCTOR`)

Appointments, notes, prescriptions, complete visit, AI retry, own leave. Isolation: other doctors’ ids → 404.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/doctor/dashboard` | Today and upcoming visits. |
| GET | `/doctor/appointments` | Own schedule. |
| GET | `/doctor/appointments/:id` | Includes AI briefing, notes, prescriptions, notification status. |
| POST | `/doctor/appointments/:id/ai/retry` | Re-queue pre-visit briefing. Does not change `BOOKED`. |
| PATCH | `/doctor/appointments/:id/notes` | Clinical notes (not visible to the patient). |
| POST | `/doctor/appointments/:id/prescriptions` | Issues Rx and schedules frequency-aware medication reminders. |
| POST | `/doctor/appointments/:id/complete` | Queues patient-friendly post-visit summary. |
| POST | `/doctor/appointments/:id/cancel` | Future booked visit. |
| GET | `/doctor/patients` | Patients who have booked with this clinician. |
| GET | `/doctor/profile` | Public clinic fields + working hours. |
| GET | `/doctor/leave` | This clinician’s leave records and overlapping visits. |
| POST | `/doctor/leave` | Body `{ startDate, endDate, reason? }`. Does not silently cancel visits. |
| POST | `/doctor/leave/:id/resolve` | Own leave only. Notify patient and doctor, release occupancy. Other doctors’ leave ids → 404. |
| POST | `/doctor/calendar/connect` | Own Google OAuth URL. |
| GET | `/doctor/calendar/callback` | Public OAuth redirect alias. |
| POST | `/doctor/calendar/disconnect` | Clears **this** doctor’s stored refresh token. |
| GET | `/doctor/calendar/status` | `{ configured, connected, status }`. |

Shared Google callback: `GET /integrations/google/callback` (set this as `GOOGLE_REDIRECT_URI`).

## Admin (`requireRole ADMIN`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/dashboard` | Counts, health, leave conflicts. |
| GET | `/admin/doctors` | Clinic doctor list (includes email for admin). |
| POST | `/admin/doctors` | Create doctor + weekday 09:00–17:00 hours. |
| GET | `/admin/doctors/:id` | Profile, working hours, leave. |
| PATCH | `/admin/doctors/:id` | Update name, specialization, bio, slot duration, years, working hours. |
| GET | `/admin/appointments` | Clinic-wide. |
| GET | `/admin/appointments/:id` | |
| POST | `/admin/appointments/:id/cancel` | |
| GET | `/admin/leave` | |
| POST | `/admin/leave` | Record leave. Does not silently cancel visits. |
| POST | `/admin/leave/:id/resolve` | Notify patient and doctor, release occupancy. |
| GET | `/admin/notifications` | Outbox reliability. |

Booking confirmation, cancellation, reschedule, and appointment reminders queue **separate** notification rows for the patient and the doctor (`unique(appointmentId, type, userId)`). AI, email, and calendar failures never roll back `BOOKED`.

## Demo simulation (admin, `DEMO_MODE`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/demo/simulation` | `{ enabled, activeFlags, availableFlags }` |
| POST | `/demo/simulation` | `{ flag, enabled }` flags: `AI`, `EMAIL`, `CALENDAR`, `CALENDAR_DOCTOR`, `CALENDAR_PATIENT`, `BOOKING_CONFLICT`, `LEAVE_CONFLICT`, `HOLD_EXPIRED`. Persisted in PostgreSQL for the worker. 403 `SIMULATION_DISABLED` in production or when demo mode is off. |

## Error codes (booking)

`SLOT_UNAVAILABLE`, `HOLD_EXPIRED`, `HOLD_NOT_OWNED`, `APPOINTMENT_NOT_FOUND`, `INVALID_APPOINTMENT_STATE`, `DOCTOR_UNAVAILABLE`, `DOCTOR_ON_LEAVE`, `UNAUTHORIZED_APPOINTMENT_ACTION`, `RATE_LIMITED`, `VALIDATION_ERROR`, `INVALID_CREDENTIALS`.
