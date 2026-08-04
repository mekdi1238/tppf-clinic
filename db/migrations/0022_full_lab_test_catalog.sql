-- Migration 0022: Full laboratory test catalog
-- Expands lab_test_catalog with all tests from the LAB REQUEST DETAILS
-- reference system, adds a normal_range column, and seeds every test
-- across the four panels: Hematology, Parasitology/Urinalysis,
-- Sed/Bacteriology/Other Body Fluids, and Chemistry.

-- +migrate Up

-- 1. Add normal_range column (nullable — not all tests have a numeric range)
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS normal_range TEXT;

-- 2. Add sort_order so tests display in the same order as the original form
ALTER TABLE lab_test_catalog ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 999;

-- 3. Wipe the old minimal seed data and re-seed from scratch
TRUNCATE lab_test_catalog RESTART IDENTITY CASCADE;

-- ── HEMATOLOGY ──────────────────────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('WBC',       'Hematology', 'WBC (White Blood Cell Count)', '4500 - 11000',  10),
  ('DIFF',      'Hematology', 'Diff (Differential Count)',    'N',             20),
  ('CBC',       'Hematology', 'CBC (Complete Blood Count)',   'L',             30),
  ('ESR',       'Hematology', 'ESR (Erythrocyte Sed. Rate)',  '0 - 20',        40),
  ('HGB',       'Hematology', 'HGB (Hemoglobin)',             '10.5 - 16',     50),
  ('HCT',       'Hematology', 'HCT (Hematocrit)',             '36.42',         60),
  ('BF',        'Hematology', 'BF (Blood Film)',              NULL,            70),
  ('CPP',       'Hematology', 'CPP',                          NULL,            80),
  ('HCVAB',     'Hematology', 'HCVAB (Hepatitis C Antibody)', NULL,            90),
  ('HBSAG',     'Hematology', 'HBSAG (Hepatitis B Antigen)',  NULL,           100),
  ('HPAB',      'Hematology', 'HPAB (H. Pylori Antibody)',    NULL,           110),
  ('RPR-VDRL',  'Hematology', 'RPR-VDRL (Syphilis Screen)',   NULL,           120),
  ('SEROLOGY',  'Hematology', 'Serology (Other)',             NULL,           130);

-- ── PARASITOLOGY ────────────────────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('STOAL',        'Parasitology', 'Stoal (Stool Examination)',  NULL, 10),
  ('CONCENTRATION','Parasitology', 'Concentration',              NULL, 20),
  ('HPAG',         'Parasitology', 'HPAG (H. Pylori Antigen)',   NULL, 30),
  ('OCCULT-BLOOD', 'Parasitology', 'Occult Blood',               NULL, 40);

-- ── URINALYSIS ───────────────────────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('HCG-P',    'Urinalysis', 'HCG-P Test (Pregnancy)',  NULL, 10),
  ('UA-COLOR', 'Urinalysis', 'Color',                   NULL, 20),
  ('UA-SPG',   'Urinalysis', 'SPG (Specific Gravity)',  NULL, 30),
  ('UA-PH',    'Urinalysis', 'PH',                      NULL, 40),
  ('UA-GLUC',  'Urinalysis', 'Glucose',                 NULL, 50),
  ('UA-PROT',  'Urinalysis', 'Protein',                 NULL, 60),
  ('UA-NITR',  'Urinalysis', 'Nitrate',                 NULL, 70),
  ('UA-LEUC',  'Urinalysis', 'Leucocyte (WBC)',         NULL, 80),
  ('UA-BLOOD', 'Urinalysis', 'Blood',                   NULL, 90);

-- ── SED (Sediment / Microscopy) ──────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('SED-BILI',  'Sed',       'Bilirobms (Bilirubin)',   NULL, 10),
  ('SED-UROB',  'Sed',       'Urobilinogen',            NULL, 20),
  ('SED-CAST',  'Sed',       'Cast',                    NULL, 30),
  ('SED-CRYS',  'Sed',       'Crystal',                 NULL, 40),
  ('SED-EPTH',  'Sed',       'Epithelial Cells',        NULL, 50),
  ('SED-RBC',   'Sed',       'RBCs',                    NULL, 60),
  ('SED-WBC',   'Sed',       'WBCs',                    NULL, 70),
  ('SED-OTHER', 'Sed',       'Other (Sed)',             NULL, 80);

-- ── BACTERIOLOGY ─────────────────────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('AFB',       'Bacteriology', 'AFB (Acid-Fast Bacilli)',  NULL, 10),
  ('G-STAIN',   'Bacteriology', 'G-Stain (Gram Stain)',    NULL, 20),
  ('WET-SMEAR', 'Bacteriology', 'Wet Smear',               NULL, 30),
  ('KOH',       'Bacteriology', 'KOH Prep (Fungal)',       NULL, 40);

-- ── OTHER BODY FLUIDS ────────────────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('OBF-CSF',    'Other Body Fluids', 'CSF (Cerebrospinal Fluid)',    NULL, 10),
  ('OBF-ASCIT',  'Other Body Fluids', 'Ascites / Abdominall Fluid',  NULL, 20),
  ('OBF-PLEUR',  'Other Body Fluids', 'Pleural Fluid',               NULL, 30),
  ('OBF-PERIT',  'Other Body Fluids', 'Peritoneal Fluid',            NULL, 40),
  ('OBF-SEMEN',  'Other Body Fluids', 'Semen Analysis',              NULL, 50);

-- ── CHEMISTRY ────────────────────────────────────────────────────────────────
INSERT INTO lab_test_catalog (code, panel, display_name, normal_range, sort_order) VALUES
  ('RBS-FBS',   'Chemistry', 'RBS / FBS (Blood Sugar)',        '75 - 120',         10),
  ('URICACID',  'Chemistry', 'Uric Acid',                      '3.4 - 7.2',        20),
  ('CR',        'Chemistry', 'CR (Creatinine)',                 '0.6 - 1.2',        30),
  ('BUN-UREA',  'Chemistry', 'BUN / Urea',                     '15 - 40',          40),
  ('SGOT-AST',  'Chemistry', 'SGOT / AST',                     '0 - 42',           50),
  ('SGPT-ALT',  'Chemistry', 'SGPT / ALT',                     '0 - 38',           60),
  ('ALP',       'Chemistry', 'ALP (Alkaline Phosphatase)',      '0 - 270',          70),
  ('CHOL',      'Chemistry', 'Cholesterol',                     '0 - 220',          80),
  ('TRIGY',     'Chemistry', 'Triglycerides',                   '0 - 150',          90),
  ('HDL',       'Chemistry', 'HDL Cholesterol',                 'Above 45',        100),
  ('LDL',       'Chemistry', 'LDL Cholesterol',                 '0 - 100',         110),
  ('LDH',       'Chemistry', 'LDH (Lactate Dehydrogenase)',     '215 - 450',       120),
  ('B-DIRECT',  'Chemistry', 'Bilirubin (Direct)',              'Upto 0.25 mg%',   130),
  ('B-TOTAL',   'Chemistry', 'Bilirubin (Total)',               'Upto 1.1 mg%',    140),
  ('T-PROTEIN', 'Chemistry', 'Total Protein',                   '6.6 - 8.7 gm%',  150),
  ('ALBUMIN',   'Chemistry', 'Albumin',                         '3.8 - 5.1 gm%',  160),
  ('SODIUM',    'Chemistry', 'Sodium',                          '145 - 155',       170),
  ('POTASSIUM', 'Chemistry', 'Potassium',                       '3.5 - 5.1 MMOL/L', 180),
  ('CALCIUM',   'Chemistry', 'Calcium',                         '1.12 - 1.32 MMOL/L', 190),
  ('CHLORIDE',  'Chemistry', 'Chloride',                        '97 - 111 MMOL/L', 200),
  ('MAGNISIUM', 'Chemistry', 'Magnesium',                       '1.6 - 2.5 mg/dL', 210),
  ('CKMB',      'Chemistry', 'CK-MB (Cardiac Enzyme)',          'Below 24 IU/L',   220),
  ('HBA1C',     'Chemistry', 'HbA1c (Glycated Hemoglobin)',     NULL,              230),
  ('CHEM-OTHER','Chemistry', 'Other (Chemistry)',               NULL,              240);

-- +migrate Down

TRUNCATE lab_test_catalog RESTART IDENTITY CASCADE;
