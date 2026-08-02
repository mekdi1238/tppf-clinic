-- Migration 0021: Backfill patient department and position from employee registrations
-- +migrate Up

UPDATE patients p
SET department = er.department,
    position = er.position
FROM employee_registrations er
WHERE p.source_employee_registration_id = er.id
  AND (p.department IS NULL OR p.department = '');

-- +migrate Down
