-- +migrate Up

CREATE TABLE admissions (
    id                      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id                INTEGER NOT NULL REFERENCES visits(id),
    patient_id              INTEGER NOT NULL REFERENCES patients(id),
    admitting_physician_id  INTEGER REFERENCES physicians(id),
    admitted_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason                  TEXT,
    status                  TEXT NOT NULL DEFAULT 'admitted',
    discharged_at           TIMESTAMPTZ,
    discharge_notes         TEXT,

    CONSTRAINT chk_admissions_status CHECK (status IN ('admitted', 'discharged')),
    CONSTRAINT chk_admissions_discharge_consistency
        CHECK (
            (status = 'discharged' AND discharged_at IS NOT NULL) OR
            (status = 'admitted' AND discharged_at IS NULL)
        )
);

CREATE INDEX idx_admissions_visit_id ON admissions(visit_id);
CREATE INDEX idx_admissions_patient_id ON admissions(patient_id);
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
