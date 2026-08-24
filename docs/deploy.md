# CareFlow production deploy (Neon → Render → Vercel)

Do not put secrets in this file. Set them in the host dashboards.

Render **Starter** does not support `preDeployCommand`. Automatic deploys use this sequence:

1. **Build** — `render.yaml` `buildCommand`
2. **Migrate** — API `startCommand` runs `prisma migrate deploy` first
3. **API** — `node backend/dist/index.js`
4. **Worker** — `node backend/dist/worker.js` (does not migrate)

## 1. Build

Render API and worker (repo root):

```text
npm ci --include=dev && npm run db:generate && npm run build -w backend
```

`--include=dev` installs Prisma, TypeScript, and tsx even when `NODE_ENV=production`. Runtime remains `NODE_ENV=production`.

Frontend (Vercel, Root Directory `frontend`):

```text
npm run build
```

Requires `VITE_API_URL` (Render API origin). Do not leave it empty.

Outputs:

- `backend/dist/index.js`
- `backend/dist/worker.js`
- `frontend/dist/` (Vercel)

## 2. Database migration

The API start command is `npm run start:api`, which runs `npm run release:migrate` then the API process. That is `prisma migrate deploy` only.

Never run:

- `prisma migrate dev`
- `prisma migrate reset`
- `npm run db:reset`

`DATABASE_URL` = Neon pooled runtime URL. `DIRECT_URL` = Neon direct URL (required in production; no fallback).

Do **not** run migrations from the worker service.

## 3. API startup

After a successful migrate:

```text
node backend/dist/index.js
```

Health check: `GET /api/health/ready`

## 4. Worker startup

```text
node backend/dist/worker.js
```

The worker does not migrate.

## First deployment order

1. Create Neon database. Copy pooled URL → `DATABASE_URL`, direct URL → `DIRECT_URL`.
2. Create Render API + worker from `render.yaml` (or connect this GitHub repo). Fill dashboard secrets (`sync: false` values).
3. Render builds, then the API start command migrates and listens. Confirm `GET https://<api>/api/health/ready` returns 200.
4. Confirm the worker is running.
5. Deploy the frontend on Vercel (`VITE_API_URL` = Render API origin, `FRONTEND_URL` / `CORS_ORIGIN` = Vercel origin).
