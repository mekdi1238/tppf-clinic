-- +migrate Up
-- 0049_user_deletion_fk_cascade_or_null.sql
-- Update foreign keys referencing users(id) to ON DELETE SET NULL / CASCADE so deleting user accounts does not fail on historical records.

-- audit_log
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- vitals
ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_recorded_by_fkey;
ALTER TABLE vitals ADD CONSTRAINT vitals_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;

-- admission_notes
ALTER TABLE admission_notes DROP CONSTRAINT IF EXISTS admission_notes_recorded_by_fkey;
ALTER TABLE admission_notes ADD CONSTRAINT admission_notes_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL;

-- lab_order_items
ALTER TABLE lab_order_items DROP CONSTRAINT IF EXISTS lab_order_items_entered_by_fkey;
ALTER TABLE lab_order_items ADD CONSTRAINT lab_order_items_entered_by_fkey FOREIGN KEY (entered_by) REFERENCES users(id) ON DELETE SET NULL;

-- dispensing_records
ALTER TABLE dispensing_records DROP CONSTRAINT IF EXISTS dispensing_records_dispensed_by_fkey;
ALTER TABLE dispensing_records ADD CONSTRAINT dispensing_records_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES users(id) ON DELETE SET NULL;

-- clinic_staff
ALTER TABLE clinic_staff DROP CONSTRAINT IF EXISTS clinic_staff_accepted_by_user_id_fkey;
ALTER TABLE clinic_staff ADD CONSTRAINT clinic_staff_accepted_by_user_id_fkey FOREIGN KEY (accepted_by_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- +migrate Down
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_user_id_fkey;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id);
