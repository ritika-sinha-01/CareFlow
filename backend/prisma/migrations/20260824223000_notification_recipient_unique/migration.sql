DROP INDEX IF EXISTS "notifications_appointment_id_type_key";

CREATE UNIQUE INDEX "notifications_appointment_id_type_user_id_key" ON "notifications"("appointment_id", "type", "user_id");
