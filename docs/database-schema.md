# Database schema

Prisma schema: `backend/prisma/schema.prisma`. PostgreSQL 16.

## Core occupancy

`appointments`

- `start_at` / `end_at` timestamptz (UTC)
- `status` `HELD | BOOKED | CANCELLED | EXPIRED | BLOCKED | COMPLETED`
- `occupancy_key` text, unique with `doctor_id` when set. Present for `HELD | BOOKED | BLOCKED`; null for `CANCELLED | EXPIRED | COMPLETED` so completed visits cannot block the slot.
- Hold columns: `held_by_user_id`, `held_at`, `hold_expires_at`
- `symptoms` preserved independently of AI columns
- AI pre/post status, calendar sync rollup, cancel metadata

`appointment_calendar_events` — one Google event per participant (`appointment_id` + `owner_user_id` unique). Stores `google_event_id`, `sync_status`, `last_error`.

`appointment_timeline_events` — append-only codes (`SLOT_HELD`, `APPOINTMENT_CONFIRMED`, …)

## Clinic configuration

`doctors`, `doctor_working_hours` (`weekday` 0–6, `start_time`/`end_time` as `HH:mm` in **clinic timezone**), `doctor_leaves` (`start_date`/`end_date` as dates)

## Async reliability

`jobs` — `GENERATE_PRE_VISIT_AI`, `GENERATE_POST_VISIT_AI`, `CALENDAR_SYNC`, hold expiry helpers, medication reminders. Status `QUEUED | PROCESSING | COMPLETED | FAILED | RETRYING`.

`notifications` — email outbox. Unique `(appointment_id, type)` prevents duplicate appointment reminders.

`medication_reminders` — from prescriptions.

`worker_heartbeats` — single-row liveness.

`demo_simulation_flags` — `flag` PK, `enabled`. Shared by API and worker.

`system_events` — audit trail for health/admin.

## Identity

`users` (`PATIENT | DOCTOR | ADMIN`), bcrypt `password_hash`. Google refresh tokens live on `users` (`google_refresh_token`) and are never returned by the API.
