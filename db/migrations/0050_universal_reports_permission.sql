-- Migration 0050: Universal Reports & Analytics Access
-- +migrate Up

-- Add 'nav.reports' and 'reports.export' to default_permissions for all roles
UPDATE roles
SET default_permissions = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM jsonb_array_elements_text(default_permissions || '["nav.reports", "reports.export"]'::jsonb) AS elem
);

-- +migrate Down
UPDATE roles
SET default_permissions = (
  SELECT jsonb_agg(elem)
  FROM jsonb_array_elements_text(default_permissions) AS elem
  WHERE elem NOT IN ('nav.reports', 'reports.export')
)
WHERE name NOT IN ('system_administrator', 'hr_admin', 'department_hr', 'hr_reporting');
