-- Migration 0025: Cleanup Preloaded Seed Physicians
-- Re-assigns old seed references to active real physicians and removes dummy preloaded physicians

-- +migrate Up

DO $$
DECLARE
    target_phys_id INTEGER;
BEGIN
    -- Pick the first non-seed active physician if available
    SELECT id INTO target_phys_id 
    FROM physicians 
    WHERE full_name NOT IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu')
    ORDER BY id ASC 
    LIMIT 1;

    -- If target_phys_id is NULL, create a default fallback physician
    IF target_phys_id IS NULL THEN
        INSERT INTO physicians (full_name, gender, qualification, is_active)
        VALUES ('Dr. Default Physician', 'male', 'General Practitioner', true)
        RETURNING id INTO target_phys_id;
    END IF;

    -- Reassign dependent foreign keys from seed dummy physicians to real physician
    UPDATE users 
    SET physician_id = NULL 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE medical_certifications 
    SET physician_id = target_phys_id 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE visits 
    SET physician_id = target_phys_id 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE admissions 
    SET admitting_physician_id = target_phys_id 
    WHERE admitting_physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE lab_orders 
    SET physician_id = target_phys_id 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE prescriptions 
    SET physician_id = target_phys_id 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE referrals 
    SET physician_id = target_phys_id 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    UPDATE sick_leaves 
    SET physician_id = target_phys_id 
    WHERE physician_id IN (SELECT id FROM physicians WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu'));

    -- Remove preloaded dummy physicians
    DELETE FROM physicians 
    WHERE full_name IN ('Dr. Selamawit Girma', 'Dr. Tesfaye Bekele', 'Dr. Hanna Alemu');
END $$;

-- +migrate Down

-- No rollback for cleanup
