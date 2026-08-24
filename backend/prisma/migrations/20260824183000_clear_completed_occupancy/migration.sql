-- Completed visits must not keep occupancy_key. The unique
-- (doctor_id, occupancy_key) index applies to every non-null key, so a
-- leftover value would permanently block that slot.
-- This backfill only touches COMPLETED rows.

UPDATE "appointments"
SET "occupancy_key" = NULL
WHERE "status" = 'COMPLETED'
  AND "occupancy_key" IS NOT NULL;
