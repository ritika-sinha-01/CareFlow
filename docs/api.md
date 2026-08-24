# CareFlow API

All JSON responses use:

```json
{ "success": true, "data": { } }
```

or

```json
{ "success": false, "error": { "code": "SLOT_UNAVAILABLE", "message": "…" } }
```

Base path: `/api`. Authenticated routes send `Authorization: Bearer <jwt>`.

## Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | Components `OPERATIONAL` / `DEGRADED` / `UNAVAILABLE`. Includes `clinicTimezone`. Calendar is `optional: true`. 503 only when overall status is `UNAVAILABLE`. |
| POST | `/auth/register` | Patient only. Rate-limited. |
| POST | `/auth/login` | Rate-limited. |
| GET | `/auth/me` | Current session. |
| PATCH | `/auth/profile` | Name/phone. |

## Patient (`requireRole PATIENT`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/patient/doctors` | Directory + next available slot. |
| GET | `/patient/doctors/:id` | Profile. |
| GET | `/patient/doctors/:id/slots?date=YYYY-MM-DD` | Civil date in clinic timezone. Returns UTC `startAt` ISO strings, `clinicTimezone`, hold remaining seconds. |
| POST | `/patient/holds` | Body `{ doctorId, startAt }`. 201 or 409 `SLOT_UNAVAILABLE` / `DOCTOR_ON_LEAVE`. |
| POST | `/patient/appointments/:id/confirm` | Body `{ symptoms }`. 409 `HOLD_EXPIRED` if the hold lapsed. |
| POST | `/patient/appointments/:id/release` | Drop a hold. |
| POST | `/patient/appointments/:id/cancel` | Future booked visit or hold. |
| POST | `/patient/appointments/:id/reschedule` | Body `{ startAt }`. Same row, new occupancy key. |
| GET | `/patient/appointments` | Own visits. |
| GET | `/patient/appointments/:id` | 404 if not owned. Includes `calendarParticipants` (status only; no event ids or tokens). |
| POST | `/patient/calendar/connect` | Own Google OAuth URL. Body `{ returnTo? }`. Tokens never returned. |
| GET | `/patient/calendar/callback` | Public OAuth redirect alias. |
| POST | `/patient/calendar/disconnect` | Clears **this** patient’s stored refresh token. |
| GET | `/patient/calendar/status` | `{ configured, connected, status }` (`CONNECTED` / `NOT_CONNECTED` / `UNAVAILABLE`). |

## Doctor (`requireRole DOCTOR`)

Appointments, notes, prescriptions, complete visit, AI retry. Isolation: other doctors’ ids → 404.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/doctor/calendar/connect` | Own Google OAuth URL. |
| GET | `/doctor/calendar/callback` | Public OAuth redirect alias. |
| POST | `/doctor/calendar/disconnect` | Clears **this** doctor’s stored refresh token. |
| GET | `/doctor/calendar/status` | `{ configured, connected, status }`. |

Shared Google callback: `GET /integrations/google/callback` (set this as `GOOGLE_REDIRECT_URI`).

## Admin

Doctors, leave create/resolve, appointments, notifications, dashboard (includes live health).

## Demo simulation (admin, `DEMO_MODE`)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/demo/simulation` | `{ enabled, activeFlags, availableFlags }` |
| POST | `/demo/simulation` | `{ flag, enabled }` flags: `AI`, `EMAIL`, `CALENDAR`, `CALENDAR_DOCTOR`, `CALENDAR_PATIENT`, `BOOKING_CONFLICT`, `LEAVE_CONFLICT`, `HOLD_EXPIRED`. Persisted in PostgreSQL for the worker. 403 `SIMULATION_DISABLED` in production or when demo mode is off. |

## Error codes (booking)

`SLOT_UNAVAILABLE`, `HOLD_EXPIRED`, `HOLD_NOT_OWNED`, `APPOINTMENT_NOT_FOUND`, `INVALID_APPOINTMENT_STATE`, `DOCTOR_UNAVAILABLE`, `DOCTOR_ON_LEAVE`, `UNAUTHORIZED_APPOINTMENT_ACTION`, `RATE_LIMITED`, `VALIDATION_ERROR`, `INVALID_CREDENTIALS`.
