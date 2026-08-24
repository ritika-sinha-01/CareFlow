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
- 🧪 **Automated tests** — backend and frontend behavior is covered, including concurrency and failure scenarios.
- 🌍 **Clinic timezone aware** — civil-time scheduling is handled using the configured clinic timezone while timestamps remain UTC.

> **AI-generated content is assistive only and is never presented as a medical diagnosis.**

## Assignment submission

Use these four artifacts. Do **not** submit a Vercel preview URL (`*.vercel.app` with a random hash such as `care-flow-frontend-jlxtubygi-ritika-dev`). Those hosts are not the hosted application.

### 1. Source zip

From the repository root (excludes `node_modules`, `.env`, and build output):

```bash
git archive --format=zip --output CareFlow-source.zip HEAD
```

That zip is the source deliverable. This repository does not use GitHub Releases.

### 2. README and supporting docs

This file is the setup guide. The rest of the assignment packet is:

| Item | Where |
|------|--------|
| Environment template | [.env.example](.env.example) |
| API documentation | [docs/api.md](docs/api.md) |
| Database schema | [docs/database-schema.md](docs/database-schema.md) |
| LLM prompts | [docs/ai-prompts.md](docs/ai-prompts.md) |
| Google Calendar OAuth setup | [docs/google-calendar-setup.md](docs/google-calendar-setup.md) |
| Local + production deploy | [docs/deploy.md](docs/deploy.md) |

Local setup is in **Local setup** below. Copy `.env.example` to `backend/.env` before `npm run dev`.

### 3. Hosted application URL

| Surface | URL |
|---------|-----|
| **App (submit this)** | https://care-flow-frontend-eta.vercel.app |
| API | https://careflow-backend-six.vercel.app |
| Health | https://careflow-backend-six.vercel.app/api/health |
| Public doctors | https://careflow-backend-six.vercel.app/api/doctors |

Redeploy the **backend** Vercel project from the latest commit if `/api/doctors` still returns 404. Then the landing page can list the six demo clinicians.

### 4. System design write-up (800 words max)

[docs/system-design.md](docs/system-design.md) — section **Assignment design brief**. It covers double-booking prevention, doctor leave conflict handling, the slot hold mechanism, and notification failure handling.

## Demo

Use this section for a 5–10 minute assignment evaluation **on the production URL above**. The live UI reads the real database and APIs. It does not invent clinician lists, slots, or bookings.

**Frontend:** https://care-flow-frontend-eta.vercel.app  
**API:** https://careflow-backend-six.vercel.app  
**Health:** https://careflow-backend-six.vercel.app/api/health  
**Public doctors:** https://careflow-backend-six.vercel.app/api/doctors

Optional services (OpenAI, email, Google Calendar) may report **UNAVAILABLE**. That is honest. Core booking still works.

Production does **not** include the local seed patient (`aarav.gupta@careflow.demo`) or local seed admin (`admin@careflow.demo`). Register a new patient. Create the production admin with the guarded command below.

### Demo patient

There is no shared production patient account.

1. Open the landing page and choose **Create patient account**, or go to `/register`.
2. Enter a first name, last name, unique email, and a password of at least 10 characters with a letter and a number.
3. After registration you land on **Find care**, which loads `GET /api/patient/doctors`.

Use any email you control if you want to inspect queued notifications later. Email delivery still requires Resend or SMTP.

### Demo doctors

Six synthetic clinicians are already in the production database from the guarded production demo seed. They are not real clinicians.

Login email format: `{firstname}.{lastname}@careflow.demo`  
Password (intentional demo seed only): `CareFlow!demo1`

| Name | Specialty | Email |
|------|-----------|-------|
| Ananya Sharma | Cardiology | `ananya.sharma@careflow.demo` |
| Rohan Mehta | Dermatology | `rohan.mehta@careflow.demo` |
| Priya Nair | General Practice | `priya.nair@careflow.demo` |
| Vikram Joshi | Pediatrics | `vikram.joshi@careflow.demo` |
| Sara Khan | Orthopedics | `sara.khan@careflow.demo` |
| Dev Patel | Neurology | `dev.patel@careflow.demo` |

Typical hours: Monday–Friday, 09:00–17:00 clinic time (`Asia/Kolkata`). Weekends are closed.

Do **not** run `npm run db:seed` against Neon. Do **not** re-run `npm run db:seed:production-demo` unless you are repairing a wiped database.

### Demo admin

There is no default production admin password in this repository.

Create the admin with the production admin seed (shell only, never a Vercel env flag):

```powershell
cd backend
$env:NODE_ENV = "production"
$env:ALLOW_PRODUCTION_ADMIN_SEED = "true"
$env:PRODUCTION_ADMIN_EMAIL = "<your-admin-email>"
$env:PRODUCTION_ADMIN_PASSWORD = "<10+ chars, letter and number>"
$env:DATABASE_URL = "<Neon pooled URL>"
$env:DIRECT_URL = "<Neon direct URL>"
npm run db:seed:production-admin
```

The command hashes the password and does not print it. Full constraints: [docs/deploy.md](docs/deploy.md).

Local `npm run db:seed` still creates `admin@careflow.demo` for laptop demos only.

### Demo walkthrough (5–10 minutes)

1. Open the landing page. Confirm the six doctors load from the API. Read **System health**: booking should be operational; AI, email, and calendar may be unavailable.
2. Register a patient and sign in.
3. Open **Find care**. You should see the six demo doctors and their specialties.
4. Select one clinician (Cardiology is a reliable first choice).
5. Continue to book and choose a **weekday**.
6. Available slots come from occupancy, not a mock grid. Pick an **Available** time (this starts a five-minute server hold).
7. Enter symptoms (at least a short sentence).
8. Confirm the booking.
9. You land on the appointment page: **Appointment confirmed**.
10. Check **Pre-visit briefing**. If OpenAI is configured it may show pending or ready. If not, status is unavailable/failed with a clear fallback. The booking stays confirmed.
11. Check **Reminders and email** plus **Calendar sync**. Queued, failed, or not-connected is expected when those services are unconfigured.
12. Open **Appointments** in the patient portal and confirm the same visit is listed.
13. Sign out. Sign in as the demo doctor you booked (`ananya.sharma@careflow.demo` / `CareFlow!demo1` unless you chose another clinician).
14. Open **Appointments** and select the visit.
15. Save consultation notes (patients cannot see these).
16. Issue a prescription (this also creates a medication reminder).
17. Choose **Complete visit and generate summary**. If AI is configured, a patient-friendly summary appears; if not, the UI shows a graceful fallback and notes/prescriptions remain saved.
18. Confirm reminder/notification rows still show queued, sent, retrying, or failed — never as a reason the visit disappeared.
19. On **Profile**, record leave if you want to show overlap detection. Notify-and-release emails the patient and the doctor; it does not silently delete history.
20. Sign out. Sign in as the production admin you seeded. Open **Doctors** to create or edit a clinician, then **Leave** to manage clinic-wide leave.

Local laptop walkthrough with simulation flags: [docs/demo-guide.md](docs/demo-guide.md).

## Product Overview

CareFlow provides separate experiences for three roles.

### Patient Portal

Patients can:

- Register and sign in
- Search and select doctors
- View available appointment slots
- Hold an appointment for five minutes
- Enter symptoms and pre-visit information
- Confirm, cancel, and reschedule appointments
- View appointment history and timelines
- View medications and reminders
- Connect Google Calendar
- Receive appointment-related notifications

### Doctor Portal

Doctors can:

- View their appointment schedule
- Review upcoming visits
- Access AI-assisted pre-visit briefs
- Review patient information relevant to the appointment
- Add consultation notes
- Create prescriptions
- Complete visits
- View patient care timelines
- Connect Google Calendar

### Admin Portal

Administrators can:

- Manage doctors
- Configure working hours
- Manage doctor leave
- Detect appointment conflicts caused by leave
- Resolve affected appointments
- Monitor appointment occupancy
- Inspect notification reliability
- Monitor system health
- Simulate integration failures in demo mode

---

# Core Booking Flow

```text
CareFlow uses a six-step booking experience rather than treating an appointment as a simple form submission.

Search Doctor
     ↓
Select Date
     ↓
Select Available Slot
     ↓
Enter Symptoms / Visit Information
     ↓
Review Appointment
     ↓
Confirm Booking
```
## Technical Highlight: Concurrency-Safe Booking

CareFlow does not use a simple:

`check availability → insert appointment`

flow.

Instead, appointment occupancy is protected at the database level.

For active appointments, PostgreSQL enforces uniqueness on:

```text
(doctor_id, occupancy_key)
```

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
- [Demo guide](docs/demo-guide.md) — local seed walkthrough; production evaluator path is in the README Demo section
- [Production deploy](docs/deploy.md) — Neon, Render Starter, Vercel

## Environment variables

See `.env.example`. Calendar and AI keys are optional. Simulation requires `DEMO_MODE=true` or `ENABLE_DEMO_SIMULATION=true` and is ignored when `APP_ENV` or `NODE_ENV` is `production`. `CLINIC_TIMEZONE` is validated at startup.

Email: Resend, SMTP, or `EMAIL_PROVIDER=test` (automated tests). Google Calendar OAuth is optional for patients and doctors; without credentials, connect returns `{ configured: false, url: null }` and bookings stay valid. Refresh tokens stay on the server.

Copy `VITE_CLINIC_TIMEZONE=Asia/Kolkata` into `frontend/.env` if you want the UI timezone explicit; it already defaults to Kolkata.

## Production topology

Intended hosting (this repo is already wired this way):

- **Vercel (frontend)** — Root Directory `frontend`. `vercel.json` rewrites SPA routes to `index.html`. Set `VITE_API_URL` to the API origin (`https://careflow-backend-six.vercel.app`).
- **Vercel (API)** — Root Directory `backend`. Express is exported as a serverless function (`backend/api/index.ts`).
- **Worker** — Vercel Cron `GET /api/internal/worker/tick` with `CRON_SECRET`. Optional Render worker (`render.yaml`) if you need the original 2-second loop. A long-lived poll loop cannot run on Vercel Functions.
- **Neon** — `DATABASE_URL` pooled; `DIRECT_URL` required in production for `prisma migrate deploy`.

Production API builds run `prisma migrate deploy`. Do **not** run `prisma migrate dev` or `prisma migrate reset` in production.

`GET /api/health/ready` is the deploy health check (database + occupancy index). `GET /api/health` is the diagnostic rollup (database, appointment engine, AI, email, worker heartbeat, Google Calendar). Optional integrations report `UNAVAILABLE` when unconfigured; that is honest, not a fake green.

Step-by-step: [docs/deploy.md](docs/deploy.md).

Seed (`npm run db:seed`) refuses to run when `APP_ENV` or `NODE_ENV` is `production`. Production demo doctors and production admin use separate guarded scripts.

## Architecture

- `frontend/` — Vite, React, TypeScript, Tailwind, shared UI primitives
- `backend/` — Express services, Prisma, PostgreSQL-backed worker (no Redis/Kafka)
- Appointments use unique `(doctor_id, occupancy_key)` where `occupancy_key = startAt.toISOString()` for HELD/BOOKED/BLOCKED, and `null` when cancelled, expired, or completed
- Demo simulation, jobs, and notifications are Postgres rows shared by API and worker
- Health checks inspect the database, occupancy index, worker heartbeat, and whether AI/email/calendar credentials exist. They do not probe live OpenAI/Google/SMTP.

## Testing

```bash
npm test                 # backend + frontend
npx prisma validate      # from backend/
npm run db:migrate
```

Backend tests cover occupancy, concurrent holds, isolation, AI/email/calendar failure isolation, worker-visible demo flags, clinic timezone slots, appointment reminders, and an end-to-end booking smoke path. Frontend tests cover route guards, hold countdown from `holdExpiresAt`, expired holds, `SLOT_UNAVAILABLE`, and confirm. Unique-constraint logs during concurrent-hold tests are expected.
