# CareFlow production deploy (Neon → Vercel)

Do not put secrets in this file. Set them in the Vercel dashboard. Never commit `.env` files.

## Topology

| Piece | Where |
|---|---|
| Frontend SPA | Vercel project, Root Directory `frontend` |
| HTTP API | Vercel project, Root Directory `backend` (Express as one serverless function) |
| Background worker | Vercel Cron (`GET /api/internal/worker/tick`) **or** optional Render worker |
| PostgreSQL | Neon (`DATABASE_URL` pooled, `DIRECT_URL` direct) |

There is **no Socket.IO** in CareFlow. Nothing realtime needs a persistent Node server.

Current assessment URLs (no trailing slash):

- Frontend: `https://care-flow-frontend-eta.vercel.app`
- API: `https://careflow-backend-six.vercel.app`

## 1. Build (API on Vercel)

Create a Vercel project with **Root Directory** `backend`. `backend/vercel.json` sets:

```text
install: cd .. && npm ci --include=dev
build:   npm run vercel-build
crons:   GET /api/internal/worker/tick every minute (`* * * * *`)
```

`vercel-build` runs `prisma generate`, then `prisma migrate deploy` **only when** `VERCEL_ENV=production`, then `tsc`.

Frontend project: Root Directory `frontend`. Requires `VITE_API_URL` = the API Vercel origin (no trailing slash) **at build time**.

## 2. Database migration

Production Vercel builds run `prisma migrate deploy` (via `scripts/migrate-deploy.ts`). Preview builds do not.

Never run `prisma migrate dev`, `prisma migrate reset`, or `npm run db:reset` against production.

You can also migrate locally with production env:

```text
npm run release:migrate
```

## 3. API

The Express app is exported from `backend/api/index.ts`. All existing `/api/*` routes are unchanged. Local:

```text
npm run dev:backend
```

still uses `node`/`tsx` `src/index.ts` (listens on `PORT`).

Health:

- `GET /api/health/live` — process liveness
- `GET /api/health/ready` — database + occupancy index (use this as the deploy probe)
- `GET /api/health` — diagnostic rollup (database, appointment engine, AI, email, worker, Google Calendar)

Health does not probe live OpenAI, Resend, SMTP, or Google. Missing credentials report `UNAVAILABLE`. That is intentional.

## 4. Worker / cron

The in-process loop in `src/worker.ts` **cannot run as a Vercel Function** (no long-lived process, 2s poll).

Compatible serverless substitute, already in `backend/vercel.json`:

- Path: `/api/internal/worker/tick`
- Schedule: `* * * * *`
- Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set on the API project
- Tick work: heartbeat, expire holds, jobs (AI + calendar), medication reminders, notification send
- Idempotent: jobs and notifications are claimed with `updateMany` so overlapping ticks do not double-send

### Vercel plan limits (do not invent a second architecture)

| Plan | What actually runs |
|---|---|
| **Pro** | Minute cron is allowed. After the first successful tick, `/api/health` `BACKGROUND_WORKER` is `OPERATIONAL` (Vercel default stale window is 150 seconds when `VERCEL` is set). |
| **Hobby** | Cron jobs run **at most once per day**, even if `vercel.json` says every minute. Health will show `BACKGROUND_WORKER` `UNAVAILABLE` for most of the day unless you set `WORKER_HEARTBEAT_STALE_MS` to about 25 hours (`90000000`). Booking still works: expired holds are treated as available when listing slots, and confirm does not wait on the worker. |

Do not fake worker health. If the tick has not run inside the stale window, status is `UNAVAILABLE`.

Optional: keep `render.yaml` **worker-only** (`npm run start:worker`) for the original 2-second loop. Use that if Hobby daily cron is too slow for AI/email demos.

`CRON_SECRET` must be at least a long random string. The tick endpoint returns 401 when it is missing or wrong.

## 5. Demo doctors

Six synthetic clinicians are already in Neon from `npm run db:seed:production-demo`. Do **not** run that script again unless you are repairing a wiped database; it is idempotent by email and will not duplicate those six.

Public list: `GET /api/doctors` (no emails or password hashes). After patient registration + login: `GET /api/patient/doctors`. If production still returns 404 for `/api/doctors`, the API project has not been redeployed with that route — deploy the backend, then the frontend.

Doctor sign-in uses the `@careflow.demo` emails in the README (password from the demo seed, not from this file as a production secret rotation).

## 6. Production admin (does not run automatically)

This script **never** runs during Vercel build or `npm run db:seed`.

Required in the **local shell only** (not Vercel env):

- `NODE_ENV=production`
- `ALLOW_PRODUCTION_ADMIN_SEED=true`
- `PRODUCTION_ADMIN_EMAIL`
- `PRODUCTION_ADMIN_PASSWORD` (10+ characters, letter and number)
- `DATABASE_URL` / `DIRECT_URL` pointing at Neon (refuses localhost)

PowerShell:

```powershell
cd "C:\Users\RITIKA SINHA\CareFlow"
$env:NODE_ENV = "production"
$env:ALLOW_PRODUCTION_ADMIN_SEED = "true"
$env:PRODUCTION_ADMIN_EMAIL = "<your-admin-email>"
$env:PRODUCTION_ADMIN_PASSWORD = "<10+ chars, letter and number>"
$env:PRODUCTION_ADMIN_FIRST_NAME = "Clinic"
$env:PRODUCTION_ADMIN_LAST_NAME = "Admin"
$env:DATABASE_URL = "<Neon pooled URL from Vercel>"
$env:DIRECT_URL = "<Neon direct URL from Vercel>"
npm run db:seed:production-admin
```

The password is hashed with bcrypt (10 rounds) and is **not** printed. Re-running updates the existing ADMIN password/name. A non-admin account with the same email is left unchanged.

## First deployment order

1. Neon: pooled URL → `DATABASE_URL`, direct URL → `DIRECT_URL`.
2. Set API production env (below), including `CRON_SECRET`.
3. Deploy the **backend** Vercel project (runs `prisma migrate deploy` on production builds).
4. Confirm `GET https://<api>/api/health/ready` returns 200.
5. Confirm `GET https://<api>/api/internal/worker/tick` without a bearer returns 401, then wait for cron (or call it once with `Authorization: Bearer $CRON_SECRET`).
6. Deploy the **frontend** with `VITE_API_URL=https://<api>` (no trailing slash).
7. Set `FRONTEND_URL` and `CORS_ORIGIN` to the frontend origin with no trailing slash.
8. Create the production admin with the guarded seed (section 6) if you need the admin portal.
9. Optional: set OpenAI, Resend/SMTP, and Google OAuth so AI/email/calendar can leave `UNAVAILABLE`.

Redeploy backend before frontend when API routes change.

## Environment (API project)

Required:

- `NODE_ENV=production`
- `APP_ENV=production`
- `JWT_SECRET` (unique, 32+ characters, not a placeholder)
- `FRONTEND_URL=https://care-flow-frontend-eta.vercel.app`
- `CORS_ORIGIN=https://care-flow-frontend-eta.vercel.app`
- `DATABASE_URL` (Neon pooled)
- `DIRECT_URL` (Neon direct, not pooled)
- `DEMO_MODE=false`
- `ENABLE_DEMO_SIMULATION=false`
- `CRON_SECRET` (Vercel Cron bearer)

Recommended:

- `WORKER_HEARTBEAT_STALE_MS=150000` (Pro / minute cron; this is the default on Vercel if unset)
- Hobby daily cron: `WORKER_HEARTBEAT_STALE_MS=90000000`

Optional (booking works without these):

- `OPENAI_API_KEY`, `AI_PROVIDER=openai`, `OPENAI_MODEL=gpt-4o-mini`
- `RESEND_API_KEY` or SMTP (`EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://careflow-backend-six.vercel.app/api/integrations/google/callback`

Do **not** set `ALLOW_PRODUCTION_ADMIN_SEED` or `ALLOW_PRODUCTION_DEMO_SEED` in Vercel. Those flags are shell-only.

## Environment (frontend project)

- `VITE_API_URL=https://careflow-backend-six.vercel.app`

## Failure handling

- Occupancy uniqueness still prevents double-booking without the worker.
- Confirm/cancel/reschedule persist even if AI, email, or calendar jobs fail.
- Unconfigured AI is stored as `FAILED` immediately (symptoms preserved). Configured AI retries then `FAILED` after exhaustion.
- Email retries with backoff, then `FAILED`. Patient and doctor have separate outbox rows.
- Medication reminders follow the doctor-supplied frequency string. `as needed` / PRN is not scheduled.
