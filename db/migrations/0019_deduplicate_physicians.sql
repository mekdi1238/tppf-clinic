-- Migration 0019: Deduplicate Physicians and Link to Registrations
-- Removes duplicate physicians created by multiple seed runs and adds a link to employee_registrations

-- +migrate Up

-- 1. Deduplicate references by pointing all foreign keys to the MIN(id) for each physician name
UPDATE users SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE users.physician_id = old_p.id;
UPDATE medical_certifications SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE medical_certifications.physician_id = old_p.id;
UPDATE visits SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE visits.physician_id = old_p.id;
UPDATE admissions SET admitting_physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE admissions.admitting_physician_id = old_p.id;
UPDATE lab_orders SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE lab_orders.physician_id = old_p.id;
UPDATE prescriptions SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE prescriptions.physician_id = old_p.id;
UPDATE referrals SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE referrals.physician_id = old_p.id;
UPDATE sick_leaves SET physician_id = p.min_id FROM (SELECT full_name, MIN(id) as min_id FROM physicians GROUP BY full_name) p JOIN physicians old_p ON old_p.full_name = p.full_name WHERE sick_leaves.physician_id = old_p.id;

-- 2. Delete the duplicates
DELETE FROM physicians WHERE id NOT IN (SELECT MIN(id) FROM physicians GROUP BY full_name);

-- 3. Link to employee_registrations with ON DELETE CASCADE
ALTER TABLE physicians ADD COLUMN source_employee_registration_id INTEGER;
ALTER TABLE physicians ADD CONSTRAINT physicians_source_employee_registration_id_fkey FOREIGN KEY (source_employee_registration_id) REFERENCES employee_registrations(id) ON DELETE CASCADE;

-- +migrate Down
ALTER TABLE physicians DROP CONSTRAINT IF EXISTS physicians_source_employee_registration_id_fkey;
ALTER TABLE physicians DROP COLUMN IF EXISTS source_employee_registration_id;
