-- Migration 0038: Laboratory Ontology Expansion and Clinical Reconciliation
-- +migrate Up

-- 1. Deduplicate & Reconcile "STOAL" / "STOOL"
DO $$
DECLARE
    stoal_id INTEGER;
    stool_id INTEGER;
BEGIN
    SELECT id INTO stoal_id FROM lab_test_catalog WHERE code = 'STOAL';
    SELECT id INTO stool_id FROM lab_test_catalog WHERE code = 'STOOL';

    IF stoal_id IS NOT NULL AND stool_id IS NOT NULL THEN
        -- Point any order items pointing to STOAL over to STOOL
        UPDATE lab_order_items SET test_id = stool_id WHERE test_id = stoal_id;
        DELETE FROM lab_test_catalog WHERE id = stoal_id;
    ELSIF stoal_id IS NOT NULL AND stool_id IS NULL THEN
        UPDATE lab_test_catalog SET code = 'STOOL' WHERE id = stoal_id;
    END IF;

    -- Ensure STOOL record is properly named and categorized
    UPDATE lab_test_catalog
    SET panel = 'Stool',
        display_name = 'Stool (Routine Examination)',
        sort_order = 10
    WHERE code = 'STOOL';
END $$;

-- 2. Insert / Update Stool Net-New Parameters (Color, Consistency, m/E)
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('STOOL-COLOR',       'Stool', 'Color',                                       NULL, 11),
  ('STOOL-CONSISTENCY', 'Stool', 'Consistency',                                 NULL, 12),
  ('STOOL-ME',          'Stool', 'm/E (Microscopic Exam - Ova & Parasites)',    NULL, 13)
ON CONFLICT (code) DO UPDATE SET
  panel = EXCLUDED.panel,
  display_name = EXCLUDED.display_name,
  normal_range = EXCLUDED.normal_range,
  sort_order = EXCLUDED.sort_order;

-- 3. Update existing Parasitology tests sort orders and panel alignment
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('CONCENTRATION', 'Parasitology', 'Concentration',            NULL, 20),
  ('HPAG',          'Parasitology', 'HPAG (H. Pylori Antigen)', NULL, 30),
  ('OCCULT-BLOOD',  'Parasitology', 'Occult Blood',             NULL, 40)
ON CONFLICT (code) DO UPDATE SET
  panel = EXCLUDED.panel,
  display_name = EXCLUDED.display_name,
  normal_range = EXCLUDED.normal_range,
  sort_order = EXCLUDED.sort_order;

-- 4. Net-New Hematology Parameters (13 parameters with validated clinical reference bounds)
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('LYMPH',   'Hematology', 'Lymph (Lymphocytes)',                         '0.8 - 4.0',   21),
  ('MID',     'Hematology', 'Mid (Mid-cell fraction / Mono/Eos/Baso)',     '0.1 - 1.5',   22),
  ('GRAN',    'Hematology', 'Gran (Granulocytes / Neutrophils)',           '2.0 - 7.0',   23),
  ('RBC',     'Hematology', 'RBC (Red Blood Cell Count)',                  '400 - 550',   24),
  ('MCV',     'Hematology', 'MCV (Mean Corpuscular Volume)',               '80 - 100',    25),
  ('MCH',     'Hematology', 'MCH (Mean Corpuscular Hemoglobin)',           '27.0 - 34.0', 26),
  ('MCHC',    'Hematology', 'MCHC (Mean Corpuscular Hgb Concentration)',   '32.0 - 36.0', 27),
  ('RDW-CV',  'Hematology', 'RDW-CV (Red Cell Distribution Width - CV)',   '11.0 - 16.0', 28),
  ('RDW-SD',  'Hematology', 'RDW-SD (Red Cell Distribution Width - SD)',   '35.0 - 56.0', 29),
  ('PLT',     'Hematology', 'Platlete (Platelet Count)',                   '150 - 450',   31),
  ('MPV',     'Hematology', 'MPV (Mean Platelet Volume)',                  '6.5 - 12.0',  32),
  ('PDW',     'Hematology', 'PDW (Platelet Distribution Width)',           '15.0 - 17.0', 33),
  ('PCT',     'Hematology', 'PCT (Plateletcrit)',                          '1.08 - 2.82', 34)
ON CONFLICT (code) DO UPDATE SET
  panel = EXCLUDED.panel,
  display_name = EXCLUDED.display_name,
  normal_range = EXCLUDED.normal_range,
  sort_order = EXCLUDED.sort_order;

-- +migrate Down
