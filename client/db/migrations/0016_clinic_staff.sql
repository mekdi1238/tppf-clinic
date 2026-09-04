-- Migration 0016: Clinic Staff
-- Depends on: employee_registrations (0001), users (0002).
-- Creates the unified clinic_staff table for all departments/positions.
-- Staff are identified by a CI-series code (CI001, CI002, ...).
-- Every staff record permanently links back to the employee_registration
-- that originated it; the R-record is never deleted or overwritten.

-- +migrate Up

-- Sequence for CI staff codes (CI001, CI002, ...)
CREATE SEQUENCE staff_code_seq START 1;

-- Unified staff table — covers all departments (Medical, Finance, HR, etc.)
CREATE TABLE clinic_staff (
    id                               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    staff_code                       TEXT NOT NULL UNIQUE,
    full_name                        TEXT NOT NULL,
    gender                           TEXT,
    date_of_birth                    DATE,
    department                       TEXT NOT NULL,
    position                         TEXT NOT NULL,
    date_recruited                   DATE,
    -- Nullable: only relevant for medical staff (physicians, lab techs, etc.)
    license_no                       TEXT,
    qualification                    TEXT,
    is_active                        BOOLEAN NOT NULL DEFAULT true,
    -- Permanent, non-nullable link back to the pre-employment registration.
    -- This is the R → CI lifecycle link: accepting as staff creates a new
    -- staff row and permanently links it to the original registration,
    -- rather than converting/overwriting the R record.
    source_employee_registration_id  INTEGER NOT NULL REFERENCES employee_registrations(id),
    -- Audit: which system user performed the "Accept as Staff" action.
    accepted_by_user_id              INTEGER REFERENCES users(id),
    created_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_staff_code_format CHECK (staff_code ~ '^CI[0-9]+$')
);

CREATE INDEX idx_clinic_staff_source ON clinic_staff(source_employee_registration_id);
CREATE INDEX idx_clinic_staff_department ON clinic_staff(department);

-- Patch the employee_registrations status constraint to include the new
-- 'accepted_as_staff' lifecycle state.
ALTER TABLE employee_registrations
    DROP CONSTRAINT chk_employee_registrations_status;

ALTER TABLE employee_registrations
    ADD CONSTRAINT chk_employee_registrations_status
        CHECK (status IN (
            'pending',
            'certified_fit',
            'certified_unfit',
            'hired',
            'withdrawn',
            'accepted_as_staff'
        ));

-- +migrate Down

ALTER TABLE employee_registrations
    DROP CONSTRAINT IF EXISTS chk_employee_registrations_status;

ALTER TABLE employee_registrations
    ADD CONSTRAINT chk_employee_registrations_status
        CHECK (status IN ('pending', 'certified_fit', 'certified_unfit', 'hired', 'withdrawn'));

DROP TABLE IF EXISTS clinic_staff;
DROP SEQUENCE IF EXISTS staff_code_seq;
