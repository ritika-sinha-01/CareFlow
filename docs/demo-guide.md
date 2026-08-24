# Demo guide

For the **assignment evaluator path on the live site**, start with the **Demo** section in [README.md](../README.md). That path uses real APIs, a newly registered patient, the six production demo doctors, and the production admin seed. It does not use `aarav.gupta@careflow.demo` or `admin@careflow.demo`.

The steps below are for a **local** `npm run db:seed` environment, including admin simulation flags that are disabled in production.

Password for all **local** seeded accounts: **`CareFlow!demo1`**

| Role | Email |
| --- | --- |
| Patient | `aarav.gupta@careflow.demo` |
| Other patients | `meera.iyer@careflow.demo`, `kabir.das@careflow.demo` |
| Doctor | `ananya.sharma@careflow.demo` (cardiology) |
| Admin | `admin@careflow.demo` |

Prerequisites from the README: `npm install`, copy `.env.example` to `backend/.env`, `npm run db:local`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`. Open the frontend URL printed by Vite (often `http://localhost:5173` or `5174`).

Set `DEMO_MODE=true` (or `ENABLE_DEMO_SIMULATION=true`) and do **not** use `APP_ENV=production`. Simulation is admin-only.

## 1. Login as patient

Open `/login`. Sign in as Aarav. You should land on the patient home.

## 2. Find doctor

Open **Find care** or **Book**. Choose Dr. Ananya Sharma (Cardiology). Demo profiles are labeled.

## 3. Hold slot

Pick a weekday date, then an **Available** time. The hold API returns `holdExpiresAt`.

## 4. Show countdown

The banner counts down from **server** `holdExpiresAt` (default five minutes). It is not a local timer started at 5:00 independently of the API.

## 5. Confirm appointment

Enter symptoms (at least a short sentence — this is not a diagnosis) and confirm. Status becomes **BOOKED**. A confirmation notification and an appointment reminder are queued; an AI job and calendar job are queued. The confirm HTTP call returns before those finish.

## 6. Show doctor view

Sign out. Sign in as `ananya.sharma@careflow.demo`. Open the appointment. You should see the visit, symptoms, and AI briefing status (`PENDING` / `READY` / `FAILED` / `RETRYING`). Completing a visit is optional for this path.

## 7. Concurrent booking protection

Use two browsers (or Aarav + Meera). Hold the **same** Ananya slot at the same moment. One hold succeeds; the other returns **`SLOT_UNAVAILABLE`**.

## 8. Expired hold

Hold a slot as Aarav. Wait until the countdown hits 0, or use admin **HOLD_EXPIRED** simulation then try confirm. Confirm must fail with **`HOLD_EXPIRED`**. The slot can be held again.

## 9. Doctor leave conflict

As admin, create leave for Ananya covering a booked date, then **resolve**. Affected visits become cancelled and occupancy is released. Trying to hold that date returns **`DOCTOR_ON_LEAVE`**.

## 10. AI failure without breaking booking

As admin, enable simulation flag **AI**. Confirm a new visit (or wait for the worker to pick up `GENERATE_PRE_VISIT_AI`). The appointment stays **BOOKED**, symptoms stay on the record, job/AI status becomes **RETRYING**. Turn **AI** off; the worker can retry. Without an OpenAI key, recovery uses a permanent graceful failure unless `AI_PROVIDER=mock`.

## 11. Notification retry

Enable **EMAIL**. Queue a booking (confirmation stays queued). Worker marks the notification **RETRYING** and increments `retryCount`. Disable **EMAIL**. With `EMAIL_PROVIDER=test` (tests) the next attempt **SENT**. With no live Resend/SMTP in a reviewer laptop, delivery stays failed/retrying and the appointment is still valid — that is honest, not a fake inbox.

## 12. Calendar failure isolation

Enable **CALENDAR** (both), **CALENDAR_DOCTOR**, or **CALENDAR_PATIENT**. Confirm a visit. Participant sync becomes **RETRYING**; status stays **BOOKED**; symptoms are unchanged. Disable the flag to observe retry. Connect calendars from patient and doctor Profile pages. Without Google OAuth the steady state is **UNAVAILABLE** / **NOT_CONNECTED**, still with a valid appointment. Live Google is only exercised when `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` are set.

## 13. Admin health / reliability dashboard

Sign in as `admin@careflow.demo`. Overview shows **OPERATIONAL / DEGRADED / UNAVAILABLE** per component from real configuration (credentials present vs missing). Calendar unavailable does not fail the product. Open notifications for retry counts. Use the simulation panel only in demo mode.
