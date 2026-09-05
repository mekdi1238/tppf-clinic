-- Migration 0037: Backfill employee registrations for patients without one

-- +migrate Up
DO $$
DECLARE
    p RECORD;
    new_reg_id INTEGER;
    new_code TEXT;
BEGIN
    FOR p IN SELECT * FROM patients WHERE source_employee_registration_id IS NULL ORDER BY id ASC LOOP
        new_code := 'R' || lpad(nextval('registration_code_seq')::text, 3, '0');
        INSERT INTO employee_registrations (
            registration_code,
            full_name,
            date_of_birth,
            gender,
            location,
            occupation,
            photo_url,
            status,
            department,
            position
        ) VALUES (
            new_code,
            p.full_name,
            p.date_of_birth,
            p.gender,
            COALESCE(p.location, ''),
            COALESCE(p.position, 'Staff'),
            p.photo_url,
            'accepted_as_staff',
            COALESCE(p.department, 'General'),
            COALESCE(p.position, 'Staff')
        ) RETURNING id INTO new_reg_id;

        UPDATE patients
        SET source_employee_registration_id = new_reg_id
        WHERE id = p.id;

        -- Also link any existing medical certifications
        UPDATE medical_certifications
        SET employee_registration_id = new_reg_id
        WHERE patient_id = p.id AND employee_registration_id IS NULL;
    END LOOP;
END $$;

-- +migrate Down
