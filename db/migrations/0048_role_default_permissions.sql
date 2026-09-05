-- +migrate Up
-- 0048_role_default_permissions.sql
-- Add default_permissions column to roles table to allow dynamic configuration and customization of predefined role defaults.

ALTER TABLE roles ADD COLUMN IF NOT EXISTS default_permissions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Seed default permissions for System Administrator (All permissions)
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dashboard',
  'nav.patients', 'patients.create', 'patients.edit', 'patients.delete', 'patients.view_history',
  'nav.visits', 'visits.create', 'visits.edit', 'visits.delete',
  'nav.admissions', 'admissions.create', 'admissions.edit', 'admissions.discharge',
  'nav.checkups', 'checkups.dispatch', 'checkups.edit_date', 'checkups.approve',
  'nav.registrations', 'registrations.create', 'registrations.edit', 'registrations.delete', 'registrations.accept',
  'nav.certifications', 'certs.create', 'certs.edit', 'certs.delete',
  'nav.laboratory', 'lab.create_order', 'lab.record_result', 'lab.delete',
  'nav.pharmacy', 'pharmacy.dispense', 'pharmacy.manage_stock', 'pharmacy.delete',
  'nav.referrals', 'referrals.create', 'referrals.edit', 'referrals.delete',
  'nav.reports', 'reports.export',
  'nav.departments', 'departments.manage',
  'nav.audit_logs', 'audit_logs.export',
  'nav.archive', 'archive.restore',
  'nav.users', 'users.create', 'users.edit', 'users.delete',
  'nav.backup', 'backup.create', 'backup.restore', 'backup.delete',
  'nav.settings', 'settings.edit',
  'nav.dept_hr', 'dept_hr.dispatch',
  'nav.profile', 'profile.edit'
)
WHERE name = 'system_administrator';

-- Seed default permissions for Physician
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dashboard',
  'nav.patients', 'patients.create', 'patients.edit', 'patients.view_history',
  'nav.visits', 'visits.create', 'visits.edit', 'visits.delete',
  'nav.admissions', 'admissions.create', 'admissions.edit', 'admissions.discharge',
  'nav.checkups', 'checkups.dispatch', 'checkups.edit_date',
  'nav.registrations',
  'nav.certifications', 'certs.create', 'certs.edit',
  'nav.laboratory', 'lab.create_order',
  'nav.pharmacy',
  'nav.referrals', 'referrals.create', 'referrals.edit',
  'nav.profile', 'profile.edit'
)
WHERE name = 'physician';

-- Seed default permissions for Receptionist
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dashboard',
  'nav.patients', 'patients.create', 'patients.edit',
  'nav.visits', 'visits.create', 'visits.delete',
  'nav.checkups', 'checkups.dispatch',
  'nav.registrations', 'registrations.create', 'registrations.edit',
  'nav.profile', 'profile.edit'
)
WHERE name = 'receptionist';

-- Seed default permissions for HR/Admin
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dashboard',
  'nav.patients', 'patients.create', 'patients.edit', 'patients.view_history',
  'nav.visits', 'visits.create', 'visits.edit', 'visits.delete',
  'nav.admissions', 'admissions.create', 'admissions.edit', 'admissions.discharge',
  'nav.checkups', 'checkups.dispatch', 'checkups.approve', 'checkups.edit_date',
  'nav.registrations', 'registrations.create', 'registrations.edit', 'registrations.delete', 'registrations.accept',
  'nav.certifications', 'certs.create', 'certs.edit',
  'nav.laboratory', 'lab.create_order', 'lab.record_result',
  'nav.pharmacy', 'pharmacy.dispense', 'pharmacy.manage_stock',
  'nav.referrals', 'referrals.create', 'referrals.edit',
  'nav.reports', 'reports.export',
  'nav.audit_logs', 'audit_logs.export',
  'nav.users', 'users.create', 'users.edit',
  'nav.profile', 'profile.edit'
)
WHERE name = 'hr_admin';

-- Seed default permissions for Department HR
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dept_hr', 'dept_hr.dispatch',
  'nav.checkups', 'checkups.dispatch', 'checkups.approve',
  'nav.reports', 'reports.export',
  'nav.profile', 'profile.edit'
)
WHERE name = 'department_hr';

-- Seed default permissions for HR Reporting
UPDATE roles
SET default_permissions = json_build_array(
  'nav.reports', 'reports.export',
  'nav.profile', 'profile.edit'
)
WHERE name = 'hr_reporting';

-- Seed default permissions for Lab Technician
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dashboard',
  'nav.patients',
  'nav.laboratory', 'lab.record_result',
  'nav.profile', 'profile.edit'
)
WHERE name = 'lab_technician';

-- Seed default permissions for Pharmacist
UPDATE roles
SET default_permissions = json_build_array(
  'nav.dashboard',
  'nav.patients',
  'nav.pharmacy', 'pharmacy.dispense', 'pharmacy.manage_stock',
  'nav.profile', 'profile.edit'
)
WHERE name = 'pharmacist';

-- +migrate Down
ALTER TABLE roles DROP COLUMN IF EXISTS default_permissions;
