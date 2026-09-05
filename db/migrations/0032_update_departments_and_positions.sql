-- +migrate Up
-- Migrate existing 'Medical' department to 'Human Resource Management'
UPDATE patients SET department = 'Human Resource Management' WHERE department = 'Medical';
UPDATE employee_registrations SET department = 'Human Resource Management' WHERE department = 'Medical';
UPDATE users SET department = 'Human Resource Management' WHERE department = 'Medical';

-- Normalize 'Production and Technic' -> 'Production and Technique'
UPDATE patients SET department = 'Production and Technique' WHERE department = 'Production and Technic';
UPDATE employee_registrations SET department = 'Production and Technique' WHERE department = 'Production and Technic';
UPDATE users SET department = 'Production and Technique' WHERE department = 'Production and Technic';

-- Normalize 'Product Quality Control Service' -> 'Production Quality Control Service'
UPDATE patients SET department = 'Production Quality Control Service' WHERE department = 'Product Quality Control Service';
UPDATE employee_registrations SET department = 'Production Quality Control Service' WHERE department = 'Product Quality Control Service';
UPDATE users SET department = 'Production Quality Control Service' WHERE department = 'Product Quality Control Service';

-- +migrate Down
UPDATE patients SET department = 'Medical' WHERE department = 'Human Resource Management' AND (position ILIKE '%nurse%' OR position ILIKE '%physician%' OR position ILIKE '%lab%' OR position ILIKE '%clinic head%');
UPDATE employee_registrations SET department = 'Medical' WHERE department = 'Human Resource Management' AND (position ILIKE '%nurse%' OR position ILIKE '%physician%' OR position ILIKE '%lab%' OR position ILIKE '%clinic head%');
