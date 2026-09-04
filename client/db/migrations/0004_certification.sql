-- Migration 0004: Certification
-- Depends on: employee_registrations (0001), physicians (0001).
-- Maps to Entity Dictionary section 3.
--
-- Note: this single table replaces BOTH "Medical Certification" and
-- "Medical Certification IU" from the old Access system. Confirmed on
-- Day 1 that IU was a duplicate, not a distinct workflow, so there is
-- deliberately no separate table or "type" column for it here.

-- +migrate Up

CREATE TABLE medical_certifications (
    id                        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_registration_id  INTEGER NOT NULL REFERENCES employee_registrations(id),
    physician_id              INTEGER NOT NULL REFERENCES physicians(id),
    examination_date          TIMESTAMPTZ,
    physical_examination      TEXT,
    personal_hygiene          TEXT,
    skin_disease              TEXT,
    stool_exam_direct         TEXT,
    syphilis                  TEXT,
    gonorrhea                 TEXT,
    other_findings            TEXT,
    result                    TEXT,
    treatment_note            TEXT,
    treatment_result_note     TEXT,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Nullable on purpose: the result isn't known until the exam is
    -- actually complete, but once it IS set, it can only be one of these
    -- two values. This is what the "hire this candidate" business rule
    -- (see the application layer, Day 4) checks against.
    CONSTRAINT chk_medical_certifications_result
        CHECK (result IS NULL OR result IN ('fit', 'unfit'))
);

CREATE INDEX idx_medical_certifications_employee_registration_id
    ON medical_certifications(employee_registration_id);
CREATE INDEX idx_medical_certifications_physician_id
    ON medical_certifications(physician_id);

-- +migrate Down

DROP TABLE IF EXISTS medical_certifications;
