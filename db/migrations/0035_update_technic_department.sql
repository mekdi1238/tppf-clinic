-- +migrate Up
-- Normalize department name to 'Production and Technic'
UPDATE patients SET department = 'Production and Technic' WHERE department = 'Production and Technique';
UPDATE employee_registrations SET department = 'Production and Technic' WHERE department = 'Production and Technique';
UPDATE users SET department = 'Production and Technic' WHERE department = 'Production and Technique';

-- +migrate Down
UPDATE patients SET department = 'Production and Technique' WHERE department = 'Production and Technic';
UPDATE employee_registrations SET department = 'Production and Technique' WHERE department = 'Production and Technic';
UPDATE users SET department = 'Production and Technique' WHERE department = 'Production and Technic';
