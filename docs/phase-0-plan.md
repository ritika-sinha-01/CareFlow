# CareFlow — Phase 0 + Phase 1 Implementation Plan

Foundation only: runnable apps, design system, API envelope, Prisma schema, seed, health checks, and reliability primitives. Auth login, portals, and booking UI are Phase 2+.

## Goals

- Both apps start locally
- PostgreSQL schema is complete enough for the rest of the product
- Seed produces a reviewable demo dataset
- Health checks are real (not cosmetic)
- Email, calendar optionality, system events, and demo simulation are structured now so later phases do not retrofit them

## Dependencies

### Root

- `concurrently` — run API, worker, and frontend together
- `tsx` — run TypeScript scripts

### Backend

- `express`, `cors`, `helmet`, `zod`
- `@prisma/client`, `prisma`
- `bcryptjs`, `jsonwebtoken`
- `nodemailer` — SMTP transport
- `resend` — production-friendly email provider
- `pg` — connectivity checks / local DB bootstrap
- `embedded-postgres` — local Postgres when Docker is unavailable
- `vitest` — unit tests for envelope, health, simulation gating

### Frontend

- `react`, `react-dom`, `react-router-dom`
- `vite`, `typescript`, `@vitejs/plugin-react`
- `tailwindcss`, `postcss`, `autoprefixer`, `tailwindcss-animate`
- `class-variance-authority`, `clsx`, `tailwind-merge`
- `lucide-react`

No Redis, Kafka, or extra services.

## Environment variables

See `.env.example`. Critical flags:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `APP_ENV` | `development` \| `demo` \| `production` |
| `ENABLE_DEMO_SIMULATION` | Must be `true` **and** `APP_ENV` must not be `production` for simulation routes |
| `EMAIL_PROVIDER` | `resend` or `smtp` |
| `RESEND_API_KEY` / `SMTP_*` | Email; booking never depends on these |
| `OPENAI_API_KEY` | AI; booking never depends on this |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Calendar; optional |
| `JWT_SECRET` | Auth (used from Phase 2) |
| `SLOT_HOLD_MINUTES` | Default hold window (5) |

## Database architecture

Appointments **are** slot occupancy. Slots are not pre-materialized.

Active occupancy uses `occupancy_key = start_at ISO timestamp` with a unique constraint on `(doctor_id, occupancy_key)`. Cancelled/expired rows set `occupancy_key` to `NULL` (PostgreSQL unique indexes allow multiple NULLs), which releases the slot.

This avoids the check-then-insert race: two concurrent inserts for the same doctor+time collide on the unique constraint; one succeeds, the other maps to `SLOT_UNAVAILABLE`.

Google Calendar event IDs and AI payloads live on the appointment. Calendar/AI failure never deletes or invalidates the appointment.

## Backend structure

```
backend/src/
  index.ts                 HTTP server
  worker.ts                Heartbeat + hold expiry + notification send
  app.ts                   Express app
  config/env.ts            Zod-validated env
  db/prisma.ts
  middleware/              error, auth, notFound
  routes/                  health, demo (gated)
  controllers/
  services/                health, email, system events, demo simulation, hold expiry
  jobs/                    worker loop + heartbeat
  utils/                   API envelope, AppError, occupancy key
```

## Frontend design-system structure

```
frontend/src/
  index.css                Tokens: off-white canvas, deep indigo, teal, urgency colors
  components/ui/           Button, Card, Input, Label, Badge, Separator
  components/StatusBadge   Color + icon + label (never color alone)
  pages/LandingPage.tsx    Quietly premium shell used to verify the system
```

## Files to create (this phase)

Root: `package.json`, `.gitignore`, `.env.example`, `README.md`, `docker-compose.yml`, `scripts/dev.ts`, `docs/phase-0-plan.md`

Backend: Prisma schema + seed, Express app, health/demo/email/event services, worker, tests, local DB script

Frontend: Vite app, Tailwind tokens, shadcn-style primitives, landing page

## Verification

1. Install dependencies
2. Start local Postgres
3. `prisma migrate deploy` (or `migrate dev`)
4. Seed
5. Vitest
6. Start API + worker + frontend and confirm both respond
