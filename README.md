# CareFlow

### Intelligent Healthcare Appointment & Care Management Platform

CareFlow is a production-shaped healthcare appointment platform designed around one principle:

> **A booking is a reliable business transaction — not just a calendar slot.**

Built for patients, doctors, and clinic administrators, CareFlow combines a six-step booking experience with concurrency-safe appointment management, expiring slot holds, AI-assisted care workflows, notifications, Google Calendar synchronization, leave conflict resolution, and operational reliability tooling.

### Why CareFlow stands out

- 🔒 **Concurrency-safe booking** — PostgreSQL uniqueness prevents double-booking even under simultaneous requests.
- ⏱️ **5-minute server-controlled slot holds** — expiry is enforced by the backend, not the browser.
- 🤖 **AI-assisted, never AI-dependent** — AI failures never invalidate a confirmed appointment.
- 📅 **Dual Google Calendar synchronization** — patient and doctor calendars are synchronized asynchronously.
- 🔄 **Reliable background jobs** — email, AI, reminders, and calendar operations use retryable jobs.
- 🏥 **Leave conflict resolution** — administrators can identify and resolve appointments affected by doctor leave.
- 🛡️ **RBAC + resource isolation** — unauthorized appointment access returns 404 rather than leaking resource existence.
- 🧪 **82 automated tests** — backend and frontend behavior is covered, including concurrency and failure scenarios.
- 🌍 **Clinic timezone aware** — civil-time scheduling is handled using the configured clinic timezone while timestamps remain UTC.

> **AI-generated content is assistive only and is never presented as a medical diagnosis.**

## Live Demo

**Hosted application:** `COMING SOON`

**API health:** `COMING SOON`

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@careflow.demo` | `CareFlow!demo1` |
| Patient | `aarav.gupta@careflow.demo` | `CareFlow!demo1` |
| Doctor | `ananya.sharma@careflow.demo` | `CareFlow!demo1` |

> Demo accounts contain synthetic data only. They do not represent real patients or clinicians.

### Recommended reviewer journey

1. Patient → search doctor → select slot → enter symptoms → confirm appointment.
2. Observe the five-minute server-side hold.
3. Doctor → open the appointment → review the pre-visit brief.
4. Doctor → add consultation notes → prescribe medication → complete visit.
5. Admin → inspect clinic health and notification reliability.
6. Admin → simulate an integration failure and observe retry/recovery behavior.
7. Demonstrate concurrent booking protection: one request succeeds while the competing request receives `SLOT_UNAVAILABLE`.

## Product Overview

Patients book through a six-step flow with a five-minute hold. Doctors receive pre-visit briefings, write notes, send prescriptions, and complete visits. Admins manage leave, occupancy conflicts, notifications, and system health. Demo failure simulation can show reviewers what happens when AI, email, calendar, booking, or leave resolution fail — without taking the clinic down.

## Technical Highlight: Concurrency-Safe Booking

CareFlow does not use a simple:

`check availability → insert appointment`

flow.

Instead, appointment occupancy is protected at the database level.

For active appointments, PostgreSQL enforces uniqueness on:

```text
(doctor_id, occupancy_key)



## Local setup

Requirements: Node.js 20+. PostgreSQL 16 (Docker Compose, any hosted Postgres, or the bundled embedded Postgres helper).

```bash
npm install
copy .env.example backend\.env   # Windows
# cp .env.example backend/.env  # macOS/Linux
```

Start a database, then migrate and seed:

```bash
npm run db:local          # starts embedded Postgres if nothing is listening
npm run db:migrate
npm run db:seed
npm test
npm run dev               # API, worker, and frontend
```

- API: http://localhost:4000/api/health
- Frontend: http://localhost:5173 (Vite uses the next port if 5173 is already taken)

`GET /api/health` is a real check. Without Resend/SMTP, OpenAI, or Google OAuth credentials, those components report **UNAVAILABLE** and overall status is **DEGRADED**. The database, appointment occupancy index, and worker can still be **OPERATIONAL**. That is intentional — calendar and email must not fake success.

If you use Docker: `docker compose up -d` (maps Postgres to port `54329` to match `.env.example`).

Sign-in is available at `/login`. Demo accounts (password `CareFlow!demo1`):

| Role | Email |
|------|--------|
| Admin | `admin@careflow.demo` |
| Patient | `aarav.gupta@careflow.demo` |
| Doctor | `ananya.sharma@careflow.demo` |

Other seeded patients: `meera.iyer@careflow.demo`, `kabir.das@careflow.demo`. Other seeded doctors include GP, dermatology, pediatrics, orthopedics, and neurology. Demo records are labeled. They are not real clinicians or patients.

### Reviewer walkthrough

1. Open the landing page and confirm live system health.
2. Sign in as Aarav (`aarav.gupta@careflow.demo`) and book a weekday slot — the hold counts down for five minutes.
3. Sign in as Dr. Sharma (`ananya.sharma@careflow.demo`) and open the visit: briefing, notes, prescription, complete visit.
4. Sign in as admin and inspect health, leave, notifications, and demo simulation flags.

Step-by-step reviewer script: [docs/demo-guide.md](docs/demo-guide.md).

## Documentation

- [System design](docs/system-design.md)
- [API](docs/api.md)
- [Database schema](docs/database-schema.md)
- [AI prompts](docs/ai-prompts.md)
- [Google Calendar setup](docs/google-calendar-setup.md)
- [Demo guide](docs/demo-guide.md) — 13 reviewer steps

## Environment variables

See `.env.example`. Calendar and AI keys are optional. Simulation requires `DEMO_MODE=true` or `ENABLE_DEMO_SIMULATION=true` and is ignored when `APP_ENV` or `NODE_ENV` is `production`. `CLINIC_TIMEZONE` is validated at startup.

Email: Resend, SMTP, or `EMAIL_PROVIDER=test` (automated tests). Google Calendar OAuth is optional for patients and doctors; without credentials, connect returns `{ configured: false, url: null }` and bookings stay valid. Refresh tokens stay on the server.

Copy `VITE_CLINIC_TIMEZONE=Asia/Kolkata` into `frontend/.env` if you want the UI timezone explicit; it already defaults to Kolkata.

## Architecture

- `frontend/` — Vite, React, TypeScript, Tailwind, shared UI primitives
- `backend/` — Express services, Prisma, PostgreSQL-backed worker (no Redis/Kafka)
- Appointments use unique `(doctor_id, occupancy_key)` where `occupancy_key = startAt.toISOString()` for HELD/BOOKED/BLOCKED, and `null` when cancelled or expired
- Demo simulation, jobs, and notifications are Postgres rows shared by API and worker
- Health checks inspect the database, occupancy index, worker heartbeat, and whether AI/email/calendar credentials exist. They do not probe live OpenAI/Google/SMTP.

## Testing

```bash
npm test                 # backend + frontend
npx prisma validate      # from backend/
npm run db:migrate
```

Backend tests cover occupancy, concurrent holds, isolation, AI/email/calendar failure isolation, worker-visible demo flags, clinic timezone slots, appointment reminders, and an end-to-end booking smoke path. Frontend tests cover route guards, hold countdown from `holdExpiresAt`, expired holds, `SLOT_UNAVAILABLE`, and confirm. Unique-constraint logs during concurrent-hold tests are expected.
