# CareFlow

Intelligent healthcare appointment and care management.

CareFlow is a quietly premium product for patients, doctors, and clinic admins. Appointments are occupancy records, not a calendar widget. Slot holds expire, concurrent booking is rejected by the database, and email, AI, and Google Calendar are optional side effects. If those integrations fail, the appointment remains valid. **AI is never a diagnosis.**

## Product Overview

Patients book through a six-step flow with a five-minute hold. Doctors receive pre-visit briefings, write notes, send prescriptions, and complete visits. Admins manage leave, occupancy conflicts, notifications, and system health. Demo failure simulation can show reviewers what happens when AI, email, calendar, booking, or leave resolution fail — without taking the clinic down.

## Current status

Working now:

- JWT login, patient registration, and RBAC portals (patient, doctor, admin)
- Record isolation: unauthorized appointment IDs return **404**, not 403
- Appointment engine: slot generation, 5-minute holds, confirm, expire, cancel, reschedule
- Concurrent holds: one success, the rest `SLOT_UNAVAILABLE`
- Leave: overlapping visits can be cancelled and released; the doctor stays unbookable on leave dates
- Optional AI pre-visit briefing and post-visit patient summary
- Optional email (Resend or SMTP) and Google Calendar sync — booking stays valid if they fail
- Consultation notes, prescriptions, medication reminders, and visit completion
- Admin system health: DATABASE, APPOINTMENT_ENGINE, AI_SERVICE, EMAIL_SERVICE, BACKGROUND_WORKER, GOOGLE_CALENDAR (`optional: true` for calendar)
- Demo failure simulation (admin-only, disabled in production unless explicitly gated)

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
4. Sign in as admin and inspect health, leave, notifications, and (if enabled) demo simulation flags.

## Environment variables

See `.env.example`. Calendar and AI keys are optional. `ENABLE_DEMO_SIMULATION` is ignored when `APP_ENV` or `NODE_ENV` is `production`.

Email: Resend or SMTP via Nodemailer. Google Calendar OAuth is optional; without credentials, connect returns `{ configured: false, url: null }` and bookings stay valid.

## Architecture

- `frontend/` — Vite, React, TypeScript, Tailwind, shared UI primitives
- `backend/` — Express services, Prisma, PostgreSQL-backed worker (no Redis/Kafka)
- Appointments use unique `(doctor_id, occupancy_key)` where `occupancy_key = startAt.toISOString()` for HELD/BOOKED/BLOCKED, and `null` when cancelled or expired
- System events include booking, hold, AI, email, calendar, leave, cancel, and reschedule
- Health checks inspect the database, occupancy index, worker heartbeat, and whether AI/email/calendar credentials exist

## Testing

```bash
npm test
```

Tests cover the API envelope, occupancy keys, concurrent holds, isolation, consultation notes/prescriptions, health rollup, and simulation gating. Unique-constraint logs during concurrent-hold tests are expected.
