# CareFlow production deploy (Neon → Vercel)

Do not put secrets in this file. Set them in the Vercel (and optional worker) dashboards.

## Topology

| Piece | Where |
|---|---|
| Frontend SPA | Vercel project, Root Directory `frontend` |
| HTTP API | Vercel project, Root Directory `backend` (Express as one serverless function) |
| Background worker | Vercel Cron (`GET /api/internal/worker/tick`) **or** optional Render worker |
| PostgreSQL | Neon (`DATABASE_URL` pooled, `DIRECT_URL` direct) |

There is **no Socket.IO** in CareFlow. Nothing realtime needs a persistent Node server.

## 1. Build (API on Vercel)

Create a Vercel project with **Root Directory** `backend`. `backend/vercel.json` sets:

```text
install: cd .. && npm ci --include=dev
build:   npm run vercel-build
```

`vercel-build` runs `prisma generate`, then `prisma migrate deploy` **only when** `VERCEL_ENV=production`, then `tsc`.

Frontend project: Root Directory `frontend`. Requires `VITE_API_URL` = the API Vercel origin.

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

Health: `GET /api/health/live`, `GET /api/health/ready`, `GET /api/health`.

## 4. Worker / jobs

The in-process loop in `src/worker.ts` **cannot run as a Vercel Function** (no long-lived process, 2s poll).

Serverless substitute: Vercel Cron calls `GET /api/internal/worker/tick` with `Authorization: Bearer $CRON_SECRET`. That runs the same tick (heartbeat, hold expiry, jobs, medication reminders, notifications).

Limits:

- Vercel Hobby crons run **once per day** (not every minute).
- Pro crons can run every minute; CareFlow’s local worker polls every **2 seconds**.
- Function `maxDuration` is 10s on Hobby and up to 60s here; a large job batch may time out.
- Worker heartbeat stale window is 15s, so `/api/health` may show `BACKGROUND_WORKER` UNAVAILABLE when only cron is used. Booking still works (expired holds are treated as available when listing slots).

Optional: keep `render.yaml` **worker-only** service (`npm run start:worker`) for the original 2s loop.

## First deployment order

1. Neon: pooled URL → `DATABASE_URL`, direct URL → `DIRECT_URL`.
2. Vercel API project (Root Directory `backend`). Set production env (below). Deploy.
3. Confirm `GET https://<api>/api/health/ready` returns 200.
4. Vercel frontend (Root Directory `frontend`): `VITE_API_URL=https://<api>`.
5. Set `FRONTEND_URL` and `CORS_ORIGIN` to the frontend origin with no trailing slash (for this deploy: `https://care-flow-frontend-eta.vercel.app`). The API allowlist also includes `FRONTEND_URL`, so a wrong `CORS_ORIGIN` host still works if `FRONTEND_URL` is the SPA. Set `GOOGLE_REDIRECT_URI` to `https://<api>/api/integrations/google/callback` if using Calendar.
6. Set `CRON_SECRET` (Vercel can generate this for Cron). Confirm jobs if you rely on cron or run the optional Render worker.

## Environment (API project)

Required in production:

- `NODE_ENV=production`, `APP_ENV=production`
- `JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGIN`
- `DATABASE_URL`, `DIRECT_URL`
- `DEMO_MODE=false`, `ENABLE_DEMO_SIMULATION=false`

Optional: `CRON_SECRET`, Google/AI/email keys.
