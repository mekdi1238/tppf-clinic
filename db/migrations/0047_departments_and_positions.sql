-- +migrate Up
-- 0047_departments_and_positions.sql
-- Create departments and department_positions tables with display ordering and seed initial standard data.

CREATE TABLE IF NOT EXISTS departments (
    id            SERIAL PRIMARY KEY,
    name          TEXT UNIQUE NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS department_positions (
    id             SERIAL PRIMARY KEY,
    department_id  INT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    display_order  INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_dept_position UNIQUE (department_id, name)
);

CREATE INDEX IF NOT EXISTS idx_dept_positions_dept_id ON department_positions(department_id);

-- Seed initial departments
INSERT INTO departments (name, display_order) VALUES
  ('Manager', 1),
  ('Finance', 2),
  ('Human Resource Management', 3),
  ('Planning and Budget Service', 4),
  ('Production Quality Control Service', 5),
  ('Production', 6),
  ('Technic', 7),
  ('Property Management', 8)
ON CONFLICT (name) DO NOTHING;

-- Seed initial positions for each department
-- 1. Manager
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('General Manager', 1)
) AS pos(name, ord)
WHERE d.name = 'Manager'
ON CONFLICT (department_id, name) DO NOTHING;

-- 2. Finance
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('Finance Section Head', 1),
  ('Senior Accountant', 2),
  ('Cashier', 3),
  ('Custodian', 4)
) AS pos(name, ord)
WHERE d.name = 'Finance'
ON CONFLICT (department_id, name) DO NOTHING;

-- 3. Human Resource Management
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('HRM Department Head', 1),
  ('HR and GS Section Head', 2),
  ('HRM and Training Supervisor', 3),
  ('HR Section Head Secretary', 4),
  ('Safety and Security Section Head', 5),
  ('General Service Supervisor', 6),
  ('Hygiene and Sanitation Supervisor', 7),
  ('Division Guard Supervisor', 8),
  ('Clinic Head', 9),
  ('Physician', 10),
  ('Nurse', 11),
  ('Laboratory Technician', 12),
  ('Pharmacy Technician', 13),
  ('Senior Kaizen Expert', 14),
  ('Integrated Management System Expert', 15),
  ('Senior Secretary', 16),
  ('Secretary of Archives', 17),
  ('Record and Head of the Archives', 18),
  ('Heavy Car Driver', 19),
  ('Automobile Driver', 20),
  ('Vehicle Assistant', 21),
  ('Security Guard', 22),
  ('Gardener', 23),
  ('Janitor', 24),
  ('Messenger', 25),
  ('Messenger and Photocopying Tasks', 26),
  ('Office Attendant', 27),
  ('Local Purchaser', 28),
  ('Senior Machine Operator', 29)
) AS pos(name, ord)
WHERE d.name = 'Human Resource Management'
ON CONFLICT (department_id, name) DO NOTHING;

-- 4. Planning and Budget Service
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('Planning and Budget Service Head', 1),
  ('Information and Statistics Expert', 2)
) AS pos(name, ord)
WHERE d.name = 'Planning and Budget Service'
ON CONFLICT (department_id, name) DO NOTHING;

-- 5. Production Quality Control Service
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('Production Quality Control Service Head', 1),
  ('Product Quality Controller', 2),
  ('Senior Production Quality Expert', 3)
) AS pos(name, ord)
WHERE d.name = 'Production Quality Control Service'
ON CONFLICT (department_id, name) DO NOTHING;

-- 6. Production
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('Production Section Head', 1),
  ('Production Supervisor', 2),
  ('Production Foreman', 3),
  ('Senior Machine Operator', 4),
  ('Machine Operator 1', 5),
  ('Machine Operator 2', 6),
  ('Production Worker', 7),
  ('Versatile Production Worker', 8),
  ('Janitor Coordinator', 9),
  ('Janitor', 10),
  ('Automobile Driver', 11)
) AS pos(name, ord)
WHERE d.name = 'Production'
ON CONFLICT (department_id, name) DO NOTHING;

-- 7. Technic
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('Technique Section Head', 1),
  ('Mechanical Engineer', 2),
  ('Electrical Engineer', 3),
  ('Senior Mechanic', 4),
  ('Senior Electrician', 5),
  ('Senior Welder', 6),
  ('Mechanic 1', 7),
  ('Mechanic 2', 8),
  ('Electrician 1', 9),
  ('Technician', 10),
  ('Janitor', 11)
) AS pos(name, ord)
WHERE d.name = 'Technic'
ON CONFLICT (department_id, name) DO NOTHING;

-- 8. Property Management
INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, pos.name, pos.ord
FROM departments d
CROSS JOIN (VALUES
  ('Property Management Department Manager', 1),
  ('Raw Material Store Head', 2),
  ('Raw Material Store Clerk', 3),
  ('Packaging Material Store Head', 4),
  ('Packaging Material Store Clerk', 5),
  ('Final Product Store Head', 6),
  ('Final Product Store Clerk', 7),
  ('Spare Parts and Sectionary Store Head', 8),
  ('Spare Parts Store Head', 9),
  ('Spare Parts Store Clerk', 10),
  ('Store Clerk', 11)
) AS pos(name, ord)
WHERE d.name = 'Property Management'
ON CONFLICT (department_id, name) DO NOTHING;

-- Also dynamically capture any other existing departments & positions present in patients/employee_registrations
INSERT INTO departments (name, display_order)
SELECT DISTINCT department, 99
FROM (
  SELECT department FROM patients WHERE department IS NOT NULL AND TRIM(department) != ''
  UNION
  SELECT department FROM employee_registrations WHERE department IS NOT NULL AND TRIM(department) != ''
  UNION
  SELECT department FROM users WHERE department IS NOT NULL AND TRIM(department) != ''
) u
ON CONFLICT (name) DO NOTHING;

INSERT INTO department_positions (department_id, name, display_order)
SELECT d.id, p.pos_name, 99
FROM (
  SELECT department, position AS pos_name FROM patients WHERE department IS NOT NULL AND position IS NOT NULL AND TRIM(position) != ''
  UNION
  SELECT department, position AS pos_name FROM employee_registrations WHERE department IS NOT NULL AND position IS NOT NULL AND TRIM(position) != ''
) p
JOIN departments d ON d.name = p.department
ON CONFLICT (department_id, name) DO NOTHING;

-- +migrate Down
DROP TABLE IF EXISTS department_positions;
DROP TABLE IF EXISTS departments;
