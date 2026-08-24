-- CreateTable
CREATE TABLE "demo_simulation_flags" (
    "flag" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demo_simulation_flags_pkey" PRIMARY KEY ("flag")
);

-- Duplicate appointment notifications would block the unique reminder key.
DELETE FROM notifications a
USING notifications b
WHERE a.ctid < b.ctid
  AND a.appointment_id IS NOT NULL
  AND a.appointment_id = b.appointment_id
  AND a.type = b.type;

-- CreateIndex
CREATE UNIQUE INDEX "notifications_appointment_id_type_key" ON "notifications"("appointment_id", "type");
