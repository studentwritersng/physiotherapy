-- Spec §4.3. No double-booking path, ever: overlapping appointments for one
-- therapist are rejected at the database level no matter what the application
-- does. The service layer checks first for a friendly error; this is the
-- backstop against two concurrent transactions both reading "free".
--
-- The predicate matters twice:
-- 1. cancelled / no_show rows must not block, or a cancelled 9am poisons 9am
--    permanently.
-- 2. was_force_booked rows are exempt, or FR5's deliberate override could never
--    insert. A force-book writer has read "occupied" and proceeded anyway, so
--    this is not the race the constraint exists to prevent.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments ADD CONSTRAINT no_therapist_overlap
  EXCLUDE USING gist (therapist_id WITH =, tstzrange(scheduled_start, scheduled_end) WITH &&)
  WHERE (deleted_at IS NULL AND status NOT IN ('cancelled', 'no_show') AND was_force_booked IS NOT TRUE);
