-- +migrate Up
-- Migration 0036: Split 'Production and Technic' into 'Production' and 'Technic'

-- 1. Sort Production positions in employee_registrations
UPDATE employee_registrations
SET department = 'Production'
WHERE department IN ('Production and Technique', 'Production and Technic')
  AND (
    lower(coalesce(position, occupation, '')) LIKE '%production%'
    OR lower(coalesce(position, occupation, '')) LIKE '%machine operator%'
    OR lower(coalesce(position, occupation, '')) LIKE '%automobile%'
    OR lower(coalesce(position, occupation, '')) LIKE '%janitor coordinator%'
    OR lower(coalesce(position, occupation, '')) LIKE '%janitor co-ordinator%'
    OR lower(coalesce(position, occupation, '')) = 'janitor'
  );

-- 2. Sort all remaining positions in employee_registrations to Technic
UPDATE employee_registrations
SET department = 'Technic'
WHERE department IN ('Production and Technique', 'Production and Technic');

-- 3. Sort Production positions in patients
UPDATE patients
SET department = 'Production'
WHERE department IN ('Production and Technique', 'Production and Technic')
  AND (
    lower(coalesce(position, '')) LIKE '%production%'
    OR lower(coalesce(position, '')) LIKE '%machine operator%'
    OR lower(coalesce(position, '')) LIKE '%automobile%'
    OR lower(coalesce(position, '')) LIKE '%janitor coordinator%'
    OR lower(coalesce(position, '')) LIKE '%janitor co-ordinator%'
    OR lower(coalesce(position, '')) = 'janitor'
  );

-- 4. Sort all remaining positions in patients to Technic
UPDATE patients
SET department = 'Technic'
WHERE department IN ('Production and Technique', 'Production and Technic');

-- 5. Sort clinic_staff if exists
UPDATE clinic_staff
SET department = 'Production'
WHERE department IN ('Production and Technique', 'Production and Technic')
  AND (
    lower(coalesce(position, '')) LIKE '%production%'
    OR lower(coalesce(position, '')) LIKE '%machine operator%'
    OR lower(coalesce(position, '')) LIKE '%automobile%'
    OR lower(coalesce(position, '')) LIKE '%janitor coordinator%'
    OR lower(coalesce(position, '')) LIKE '%janitor co-ordinator%'
    OR lower(coalesce(position, '')) = 'janitor'
  );

UPDATE clinic_staff
SET department = 'Technic'
WHERE department IN ('Production and Technique', 'Production and Technic');

-- 6. Update users with old department name
UPDATE users
SET department = 'Production'
WHERE department = 'Production and Technic' OR department = 'Production and Technique';

-- +migrate Down
UPDATE patients
SET department = 'Production and Technic'
WHERE department IN ('Production', 'Technic');

UPDATE employee_registrations
SET department = 'Production and Technic'
WHERE department IN ('Production', 'Technic');

UPDATE clinic_staff
SET department = 'Production and Technic'
WHERE department IN ('Production', 'Technic');

UPDATE users
SET department = 'Production and Technic'
WHERE department IN ('Production', 'Technic');
