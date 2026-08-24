-- AlterTable users
ALTER TABLE "users" ADD COLUMN "google_refresh_token" TEXT;
ALTER TABLE "users" ADD COLUMN "google_calendar_id" TEXT;
ALTER TABLE "users" ADD COLUMN "calendar_connected" BOOLEAN NOT NULL DEFAULT false;

-- Copy existing doctor OAuth tokens onto the user row
UPDATE "users" AS u
SET
  "google_refresh_token" = d."google_refresh_token",
  "google_calendar_id" = d."google_calendar_id",
  "calendar_connected" = d."calendar_connected"
FROM "doctors" AS d
WHERE d."user_id" = u."id";

-- CreateTable
CREATE TABLE "appointment_calendar_events" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "google_event_id" TEXT,
    "sync_status" "CalendarSyncStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_calendar_events_pkey" PRIMARY KEY ("id")
);

-- Migrate any existing doctor event ids
INSERT INTO "appointment_calendar_events" (
  "id",
  "appointment_id",
  "owner_user_id",
  "google_event_id",
  "sync_status",
  "last_error",
  "created_at",
  "updated_at"
)
SELECT
  'ce' || a."id",
  a."id",
  d."user_id",
  a."google_event_id",
  a."calendar_sync_status",
  a."calendar_sync_error",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "appointments" a
JOIN "doctors" d ON d."id" = a."doctor_id"
WHERE a."google_event_id" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "calendar_events_appointment_owner_key" ON "appointment_calendar_events"("appointment_id", "owner_user_id");
CREATE INDEX "appointment_calendar_events_owner_user_id_sync_status_idx" ON "appointment_calendar_events"("owner_user_id", "sync_status");

-- AddForeignKey
ALTER TABLE "appointment_calendar_events" ADD CONSTRAINT "appointment_calendar_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointment_calendar_events" ADD CONSTRAINT "appointment_calendar_events_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop doctor-only token columns and the single appointment event id
ALTER TABLE "appointments" DROP COLUMN "google_event_id";
ALTER TABLE "doctors" DROP COLUMN "google_refresh_token";
ALTER TABLE "doctors" DROP COLUMN "google_calendar_id";
ALTER TABLE "doctors" DROP COLUMN "calendar_connected";
