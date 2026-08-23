-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('HELD', 'BOOKED', 'CANCELLED', 'EXPIRED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "CancelReason" AS ENUM ('PATIENT', 'DOCTOR', 'ADMIN', 'LEAVE', 'EXPIRED_HOLD', 'SYSTEM');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AiGenerationStatus" AS ENUM ('IDLE', 'PENDING', 'READY', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('BOOKING_CONFIRMATION', 'APPOINTMENT_REMINDER', 'CANCELLATION', 'RESCHEDULE', 'LEAVE_AFFECTED', 'MEDICATION_REMINDER', 'POST_VISIT_SUMMARY');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('NOT_CONNECTED', 'PENDING', 'SYNCED', 'FAILED', 'RETRYING', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('EXPIRE_HOLDS', 'SEND_NOTIFICATION', 'GENERATE_PRE_VISIT_AI', 'GENERATE_POST_VISIT_AI', 'CALENDAR_SYNC', 'MEDICATION_REMINDER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "TimelineCode" AS ENUM ('SLOT_RESERVED', 'APPOINTMENT_CONFIRMED', 'AI_SUMMARY_GENERATED', 'AI_SUMMARY_FAILED', 'EMAIL_SENT', 'EMAIL_FAILED', 'CALENDAR_EVENT_CREATED', 'CALENDAR_SYNC_FAILED', 'CONSULTATION', 'PRESCRIPTION_ISSUED', 'FOLLOW_UP', 'CANCELLED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "SystemEventType" AS ENUM ('BOOKING_CREATED', 'BOOKING_CONFLICT', 'SLOT_HELD', 'SLOT_EXPIRED', 'AI_REQUEST_FAILED', 'AI_REQUEST_SUCCEEDED', 'EMAIL_SENT', 'EMAIL_FAILED', 'EMAIL_RETRY', 'CALENDAR_SYNCED', 'CALENDAR_SYNC_FAILED', 'DOCTOR_LEAVE_CREATED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_RESCHEDULED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "date_of_birth" DATE,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "bio" TEXT,
    "slot_duration_min" INTEGER NOT NULL DEFAULT 30,
    "years_experience" INTEGER,
    "is_demo" BOOLEAN NOT NULL DEFAULT false,
    "google_refresh_token" TEXT,
    "google_calendar_id" TEXT,
    "calendar_connected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_working_hours" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,

    CONSTRAINT "doctor_working_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_leaves" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_leaves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "doctor_id" TEXT NOT NULL,
    "patient_id" TEXT,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "occupancy_key" TEXT,
    "held_by_user_id" TEXT,
    "held_at" TIMESTAMP(3),
    "hold_expires_at" TIMESTAMP(3),
    "symptoms" TEXT,
    "ai_pre_visit_status" "AiGenerationStatus" NOT NULL DEFAULT 'IDLE',
    "ai_urgency" "Urgency",
    "ai_chief_complaint" TEXT,
    "ai_suggested_questions" JSONB,
    "ai_key_symptoms" JSONB,
    "ai_pre_visit_error" TEXT,
    "ai_pre_visit_generated_at" TIMESTAMP(3),
    "clinical_notes" TEXT,
    "ai_post_visit_status" "AiGenerationStatus",
    "patient_summary" TEXT,
    "follow_up_steps" JSONB,
    "medication_schedule" JSONB,
    "ai_post_visit_error" TEXT,
    "google_event_id" TEXT,
    "calendar_sync_status" "CalendarSyncStatus" NOT NULL DEFAULT 'NOT_CONNECTED',
    "calendar_sync_error" TEXT,
    "cancel_reason" "CancelReason",
    "cancelled_at" TIMESTAMP(3),
    "rescheduled_from_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_timeline_events" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "code" "TimelineCode" NOT NULL,
    "label" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "appointment_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medication_reminders" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "patient_id" TEXT NOT NULL,
    "medication_name" TEXT NOT NULL,
    "schedule_label" TEXT NOT NULL,
    "next_fire_at" TIMESTAMP(3) NOT NULL,
    "last_sent_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medication_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "appointment_id" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "to_email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "payload" JSONB NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 5,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_events" (
    "id" TEXT NOT NULL,
    "type" "SystemEventType" NOT NULL,
    "message" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_heartbeats" (
    "id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "hostname" TEXT,
    "pid" INTEGER,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "doctors_user_id_key" ON "doctors"("user_id");

-- CreateIndex
CREATE INDEX "doctors_specialization_idx" ON "doctors"("specialization");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_working_hours_doctor_id_weekday_key" ON "doctor_working_hours"("doctor_id", "weekday");

-- CreateIndex
CREATE INDEX "doctor_leaves_doctor_id_start_date_end_date_idx" ON "doctor_leaves"("doctor_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "appointments_doctor_id_start_at_idx" ON "appointments"("doctor_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_patient_id_start_at_idx" ON "appointments"("patient_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_status_hold_expires_at_idx" ON "appointments"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "appointments_status_start_at_idx" ON "appointments"("status", "start_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_active_slot_key" ON "appointments"("doctor_id", "occupancy_key");

-- CreateIndex
CREATE INDEX "appointment_timeline_events_appointment_id_occurred_at_idx" ON "appointment_timeline_events"("appointment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "medication_reminders_next_fire_at_is_active_idx" ON "medication_reminders"("next_fire_at", "is_active");

-- CreateIndex
CREATE INDEX "medication_reminders_patient_id_is_active_idx" ON "medication_reminders"("patient_id", "is_active");

-- CreateIndex
CREATE INDEX "notifications_status_next_attempt_at_idx" ON "notifications"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "jobs_status_available_at_idx" ON "jobs"("status", "available_at");

-- CreateIndex
CREATE INDEX "jobs_type_status_idx" ON "jobs"("type", "status");

-- CreateIndex
CREATE INDEX "system_events_type_created_at_idx" ON "system_events"("type", "created_at");

-- CreateIndex
CREATE INDEX "system_events_created_at_idx" ON "system_events"("created_at");

-- CreateIndex
CREATE INDEX "system_events_entity_type_entity_id_idx" ON "system_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "doctors" ADD CONSTRAINT "doctors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_working_hours" ADD CONSTRAINT "doctor_working_hours_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_leaves" ADD CONSTRAINT "doctor_leaves_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_id_fkey" FOREIGN KEY ("doctor_id") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_held_by_user_id_fkey" FOREIGN KEY ("held_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_timeline_events" ADD CONSTRAINT "appointment_timeline_events_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_reminders" ADD CONSTRAINT "medication_reminders_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_reminders" ADD CONSTRAINT "medication_reminders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
