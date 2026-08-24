# Google Calendar setup

Calendar sync is **optional** for both patients and doctors. Unconfigured or failed sync never cancels, reschedules, or rolls back a booking. Health shows `GOOGLE_CALENDAR` as `optional: true`.

Live Google Calendar has **not** been verified in this environment unless `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` are actually set. Automated tests use a mock `CalendarService` adapter and do not call Google.

## What you need

1. A Google Cloud project
2. OAuth client type **Web application**
3. Scope used by CareFlow:

```
https://www.googleapis.com/auth/calendar.events
```

4. Authorized redirect URI exactly matching `GOOGLE_REDIRECT_URI`

## Environment

```
CALENDAR_PROVIDER=google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:4000/api/integrations/google/callback
```

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret (server-side only) |
| `GOOGLE_REDIRECT_URI` | Must match the Google Cloud authorized redirect URI |

Local example redirect:

```
http://localhost:4000/api/integrations/google/callback
```

Aliases that run the same callback handler (no JWT required, because Google redirects here):

- `GET /api/patient/calendar/callback`
- `GET /api/doctor/calendar/callback`

Configure Google Cloud with **one** redirect URI — the value in `GOOGLE_REDIRECT_URI`. Prefer `/api/integrations/google/callback`.

Production: set `GOOGLE_REDIRECT_URI` to the public API origin (Render), for example `https://<api-host>/api/integrations/google/callback`. Localhost redirect URLs are rejected when `APP_ENV` or `NODE_ENV` is `production`.

Without these three variables, `GET /api/health` reports calendar **UNAVAILABLE** (“OAuth is not configured — appointments remain valid”). The health check does **not** call the live Calendar API.

`CALENDAR_PROVIDER=mock` is for automated tests only.

## Connect flow

1. Sign in as a **patient** or **doctor**.
2. Open Profile / Settings.
3. Start Google connect. CareFlow signs a short-lived OAuth `state` JWT bound to **that user’s id** (never a client-supplied target user).
4. Google redirects to the callback. A **refresh token** is stored on `users.google_refresh_token` (server-side only). It is never returned in API responses.
5. Booking, reschedule, cancel, and leave-resolution enqueue `CALENDAR_SYNC` jobs **after** the appointment transaction commits.
6. The worker writes **one Google event per connected participant** (doctor calendar and patient calendar). Event description includes doctor name, patient name, specialization, and appointment time in `CLINIC_TIMEZONE`. It does **not** include symptoms or clinical notes.

## Failure

Each participant has a row in `appointment_calendar_events` (`SYNCED`, `RETRYING`, `FAILED`, `UNAVAILABLE`, `NOT_CONNECTED`). Appointment `calendar_sync_status` is a rollup. The visit stays `BOOKED` / `CANCELLED` regardless.

Demo flags (PostgreSQL `demo_simulation_flags`, shared by API and worker):

- `CALENDAR` — fail both participant syncs
- `CALENDAR_DOCTOR` — fail only the doctor event
- `CALENDAR_PATIENT` — fail only the patient event

Disconnecting in CareFlow clears local tokens. It does not revoke the Google grant remotely (MVP limitation).
