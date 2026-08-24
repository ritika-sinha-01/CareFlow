# CareFlow system design

CareFlow is a clinic occupancy system with optional AI, email, and calendar side effects. PostgreSQL is the source of truth for appointments, jobs, notifications, and demo simulation flags. There is no Redis, Kafka, or Kubernetes requirement.

```
Patient / Doctor / Admin UI
            │  JWT Bearer
            ▼
     Express API process
            │
            ▼
        PostgreSQL
            ▲
            │
     Worker process (polls jobs + notifications)
```

Appointment timestamps are stored in UTC. Civil dates and working hours use `CLINIC_TIMEZONE` (default `Asia/Kolkata`).

## 1. Architecture

- `frontend/` Vite + React portal
- `backend/` Express + Prisma
- `backend/src/worker.ts` polls due jobs and notifications and writes a heartbeat row
- Integrations are adapters: OpenAI or mock AI, Resend/SMTP/test email, Google Calendar or mock calendar

Booking never waits on AI, email, or calendar. Side effects are queued after the occupancy write commits.

## 2. Authentication and RBAC

- Patients register. Doctors and admins are provisioned (seed or admin create-doctor).
- Passwords are hashed with bcrypt (10 rounds).
- JWT is signed with `JWT_SECRET`, expires with `JWT_EXPIRES_IN` (default 8h).
- `requireAuth` / `requireRole` protect routes. Patients, doctors, and admins have separate routers.
- Resource isolation: a patient requesting another patient's appointment id receives **404 `APPOINTMENT_NOT_FOUND`**, not 403.
- Login and register are rate-limited (20 attempts / 15 minutes / IP+email, in-memory).
- **JWT in `localStorage` is an intentional MVP tradeoff.** See security notes below.

## 3. Double-booking prevention

An appointment row is occupancy. Concurrent inserts on the same doctor slot collide on a unique index and become HTTP **409 `SLOT_UNAVAILABLE`**. Raw Prisma errors are never returned.

## 4. Occupancy key strategy

For `HELD`, `BOOKED`, and `BLOCKED`:

`occupancy_key = startAt.toISOString()` (UTC instant)

Unique `(doctor_id, occupancy_key)`. Cancelled and expired rows set `occupancy_key` to `NULL`. PostgreSQL unique indexes allow multiple NULLs, so history can share a slot after release.

## 5. Slot holds and expiration

Holds last `SLOT_HOLD_MINUTES` (default 5). Confirm is `updateMany` where `status=HELD` AND `holdExpiresAt > now`. The UI countdown uses the server `holdExpiresAt`, not a local guess. The worker also expires stale holds; confirm does not trust the worker alone.

## 6. Concurrent booking behavior

Two patients holding the same slot: one `201`, the other `409 SLOT_UNAVAILABLE`. The unique index is the lock of last resort; the API also takes a doctor row lock (`SELECT … FOR UPDATE`) before insert.

## 7. Doctor leave conflict handling

Leave is stored as civil dates. Slot listing and `assertSlotBookable` reject those dates (`DOCTOR_ON_LEAVE`). Admin can resolve overlapping `HELD`/`BOOKED` visits: they are cancelled, occupancy released, reminders invalidated, and a leave notification is queued. History rows remain.

## 8. Cancellation

Patient, doctor, or admin can cancel a future `BOOKED` visit (or a hold). Occupancy is released. Reminder notifications are marked failed. Calendar delete is queued. The appointment row is not deleted.

## 9. Rescheduling safety

Reschedule updates the **same row** to a new UTC start and occupancy key. If the target slot is taken, the unique violation leaves the original visit unchanged (`SLOT_UNAVAILABLE`). The reminder `nextAttemptAt` is updated to the new start minus lead time.

## 10. AI failure isolation

Pre-visit briefing is a `GENERATE_PRE_VISIT_AI` job. Failures set `aiPreVisitStatus` to `RETRYING` or `FAILED`. Symptoms are never overwritten. Missing OpenAI credentials is a permanent, graceful failure. Demo AI simulation is retryable so reviewers can turn the flag off and watch recovery (mock adapter in tests).

## 11. Notification retry architecture

Notifications live in PostgreSQL (`QUEUED` → `PROCESSING` → `SENT` | `RETRYING` | `FAILED`). Backoff: 30s, 60s, 2m, 5m, 10m, max 5. Email simulation throws in `sendEmail`; the worker sees the same Postgres flag the API wrote. Test transport (`EMAIL_PROVIDER=test`) succeeds without a mailbox.

Appointment reminders are queued on confirm (`APPOINTMENT_REMINDER`), unique per `(appointment_id, type)`. Cancel/leave invalidate them. The worker skips send if the visit is no longer `BOOKED`.

## 12. Calendar failure isolation

Calendar sync is a `CALENDAR_SYNC` job queued **after** the appointment transaction commits. The worker creates, updates, or deletes a Google event for each connected participant (patient and doctor). Participant rows live in `appointment_calendar_events` with a unique `(appointment_id, owner_user_id)`. Persisted `google_event_id` values make retries idempotent (create if missing, update if present, delete is success if already gone). Failure sets participant `syncStatus` to `RETRYING` / `FAILED` / `UNAVAILABLE` / `NOT_CONNECTED`. The appointment stays `BOOKED` (or stays cancelled). Google OAuth is optional for both roles. Tokens are stored on `users` and never returned by the API. Mock adapter exists for tests. Live Google is not assumed unless OAuth credentials are configured.

## 13. Background worker

The worker process calls `processDueJobs` and `processDueNotifications` on an interval and heartbeats `worker_heartbeats`. Health is `UNAVAILABLE` if the heartbeat is missing or stale. Demo flags are **not** process-local: they are rows in `demo_simulation_flags`.

## 14. Clinic timezone handling

`CLINIC_TIMEZONE` is validated at API/worker startup via `Intl`. Working hours (`09:00`–`17:00`) and leave dates are civil values in that zone and converted to UTC instants for storage and occupancy keys. The frontend formats with `VITE_CLINIC_TIMEZONE` (same default). Dashboards' "today" uses clinic day bounds, not the machine timezone.

## Security (MVP)

| Topic | Decision |
| --- | --- |
| JWT in `localStorage` | Intentional MVP tradeoff. XSS could steal the token. React does not inject HTML from API token fields. httpOnly cookies would be the production follow-up. |
| Token expiration | Default 8h. Expired/invalid Bearer → 401. |
| Role in JWT | Role is not re-read from DB on each request. Revoking a role requires waiting for expiry or rotating `JWT_SECRET`. Documented limitation. |
| Passwords | bcrypt 10. Seed/demo uses the same hasher. |
| Secrets | `.env` is gitignored. `JWT_SECRET` min 32 chars; known placeholders are rejected in production. Google refresh tokens are stored server-side only. |
| CORS | Allowlist `CORS_ORIGIN`; localhost any port in non-production. Production requires explicit `FRONTEND_URL` and `CORS_ORIGIN` (localhost defaults are rejected). |
| Input validation | Zod on auth and appointment bodies. |
| Rate limiting | Login/register 20 / 15 min / IP+email, in-memory (not shared across API processes). |
| Error leakage | Handlers return `{ success, error: { code, message } }`. Unhandled errors are generic `INTERNAL_ERROR`. Prisma occupancy unique → `SLOT_UNAVAILABLE`. |
| Demo simulation | Admin-only, requires `DEMO_MODE=true` or `ENABLE_DEMO_SIMULATION=true`, forced off when `APP_ENV` or `NODE_ENV` is production. |
