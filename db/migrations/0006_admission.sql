-- Migration 0006: Admission
-- Depends on: visits (0005), patients (0003), physicians (0001), users (0002).
-- Maps to Entity Dictionary section 5.
--
-- Deliberately simple, per the Day 1 decision: admitted/discharged status
-- and daily notes, no bed/ward-level tracking.

-- +migrate Up

CREATE TABLE admissions (
    id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id                INTEGER NOT NULL REFERENCES visits(id),
    -- Denormalized from visits.patient_id on purpose: the patient can't
    -- change mid-admission, so duplicating it here isn't a data integrity
    -- risk, and it means a report can query admissions directly without
    -- always having to join back through visits.
    patient_id              INTEGER NOT NULL REFERENCES patients(id),
    admitting_physician_id  INTEGER REFERENCES physicians(id),
    admitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason                  TEXT,
    status                  TEXT NOT NULL DEFAULT 'admitted',
    discharged_at           TIMESTAMPTZ,
    discharge_notes         TEXT,

    CONSTRAINT chk_admissions_status CHECK (status IN ('admitted', 'discharged')),
    -- If status says discharged, there has to be a discharge timestamp,
    -- and vice versa — this catches a whole category of "forgot to set
    -- the other field" bugs at the database level.
    CONSTRAINT chk_admissions_discharge_consistency
        CHECK (
            (status = 'discharged' AND discharged_at IS NOT NULL) OR
            (status = 'admitted' AND discharged_at IS NULL)
        )
);

CREATE INDEX idx_admissions_visit_id ON admissions(visit_id);
CREATE INDEX idx_admissions_patient_id ON admissions(patient_id);
-- Partial index: most queries against this table will be "who is
-- currently admitted" — indexing only the admitted rows keeps that lookup
-- fast without wasting space indexing historical discharged records too.
CREATE INDEX idx_admissions_currently_admitted ON admissions(patient_id) WHERE status = 'admitted';

CREATE TABLE admission_notes (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admission_id  INTEGER NOT NULL REFERENCES admissions(id),
    note          TEXT NOT NULL,
    recorded_by   INTEGER REFERENCES users(id),
    recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admission_notes_admission_id ON admission_notes(admission_id);

-- +migrate Down

DROP TABLE IF EXISTS admission_notes;
DROP TABLE IF EXISTS admissions;
