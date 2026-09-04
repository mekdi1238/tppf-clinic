-- Migration 0018: Add Cascade Deletes
-- Updates foreign keys to support hard deletions of patients and registrations.

-- +migrate Up

-- 1. Employee Registrations cascades
ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_source_employee_registration_id_fkey;
ALTER TABLE patients ADD CONSTRAINT patients_source_employee_registration_id_fkey FOREIGN KEY (source_employee_registration_id) REFERENCES employee_registrations(id) ON DELETE CASCADE;

ALTER TABLE clinic_staff DROP CONSTRAINT IF EXISTS clinic_staff_source_employee_registration_id_fkey;
ALTER TABLE clinic_staff ADD CONSTRAINT clinic_staff_source_employee_registration_id_fkey FOREIGN KEY (source_employee_registration_id) REFERENCES employee_registrations(id) ON DELETE CASCADE;

ALTER TABLE medical_certifications DROP CONSTRAINT IF EXISTS medical_certifications_employee_registration_id_fkey;
ALTER TABLE medical_certifications ADD CONSTRAINT medical_certifications_employee_registration_id_fkey FOREIGN KEY (employee_registration_id) REFERENCES employee_registrations(id) ON DELETE CASCADE;


-- 2. Patients cascades
ALTER TABLE visits DROP CONSTRAINT IF EXISTS visits_patient_id_fkey;
ALTER TABLE visits ADD CONSTRAINT visits_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_patient_id_fkey;
ALTER TABLE admissions ADD CONSTRAINT admissions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_patient_id_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_patient_id_fkey;
ALTER TABLE referrals ADD CONSTRAINT referrals_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;

ALTER TABLE sick_leaves DROP CONSTRAINT IF EXISTS sick_leaves_patient_id_fkey;
ALTER TABLE sick_leaves ADD CONSTRAINT sick_leaves_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE;


-- 3. Visits cascades
ALTER TABLE vitals DROP CONSTRAINT IF EXISTS vitals_visit_id_fkey;
ALTER TABLE vitals ADD CONSTRAINT vitals_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE admissions DROP CONSTRAINT IF EXISTS admissions_visit_id_fkey;
ALTER TABLE admissions ADD CONSTRAINT admissions_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE lab_orders DROP CONSTRAINT IF EXISTS lab_orders_visit_id_fkey;
ALTER TABLE lab_orders ADD CONSTRAINT lab_orders_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_visit_id_fkey;
ALTER TABLE prescriptions ADD CONSTRAINT prescriptions_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE referrals DROP CONSTRAINT IF EXISTS referrals_visit_id_fkey;
ALTER TABLE referrals ADD CONSTRAINT referrals_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;

ALTER TABLE sick_leaves DROP CONSTRAINT IF EXISTS sick_leaves_visit_id_fkey;
ALTER TABLE sick_leaves ADD CONSTRAINT sick_leaves_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES visits(id) ON DELETE CASCADE;


-- 4. Deeper cascades
ALTER TABLE admission_notes DROP CONSTRAINT IF EXISTS admission_notes_admission_id_fkey;
ALTER TABLE admission_notes ADD CONSTRAINT admission_notes_admission_id_fkey FOREIGN KEY (admission_id) REFERENCES admissions(id) ON DELETE CASCADE;

ALTER TABLE lab_order_items DROP CONSTRAINT IF EXISTS lab_order_items_lab_order_id_fkey;
ALTER TABLE lab_order_items ADD CONSTRAINT lab_order_items_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES lab_orders(id) ON DELETE CASCADE;

ALTER TABLE prescription_items DROP CONSTRAINT IF EXISTS prescription_items_prescription_id_fkey;
ALTER TABLE prescription_items ADD CONSTRAINT prescription_items_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES prescriptions(id) ON DELETE CASCADE;

ALTER TABLE dispensing_records DROP CONSTRAINT IF EXISTS dispensing_records_prescription_item_id_fkey;
ALTER TABLE dispensing_records ADD CONSTRAINT dispensing_records_prescription_item_id_fkey FOREIGN KEY (prescription_item_id) REFERENCES prescription_items(id) ON DELETE CASCADE;


-- +migrate Down
-- (Downgrade intentionally left blank as removing CASCADE requires restoring original constraints without CASCADE, which is effectively just re-defining the original foreign keys.)
