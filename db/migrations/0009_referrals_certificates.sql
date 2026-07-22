-- Migration 0009: Referrals & Certificates
-- Depends on: visits (0005), patients (0003), physicians (0001).
-- Maps to Entity Dictionary section 8.

-- +migrate Up

CREATE TABLE referrals (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id       INTEGER NOT NULL REFERENCES visits(id),
    patient_id     INTEGER REFERENCES patients(id),
    physician_id   INTEGER REFERENCES physicians(id),
    diagnosis      TEXT,
    referral_date  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason         TEXT,
    referred_to    TEXT,
    note           TEXT
);

CREATE INDEX idx_referrals_visit_id ON referrals(visit_id);
CREATE INDEX idx_referrals_patient_id ON referrals(patient_id);

CREATE TABLE sick_leaves (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    visit_id       INTEGER NOT NULL REFERENCES visits(id),
    patient_id     INTEGER REFERENCES patients(id),
    physician_id   INTEGER REFERENCES physicians(id),
    diagnosis      TEXT,
    exam_date      TIMESTAMPTZ,
    leave_start    DATE NOT NULL,
    leave_end      DATE NOT NULL,

    CONSTRAINT chk_sick_leaves_date_order CHECK (leave_end >= leave_start)
);

CREATE INDEX idx_sick_leaves_visit_id ON sick_leaves(visit_id);
CREATE INDEX idx_sick_leaves_patient_id ON sick_leaves(patient_id);

-- +migrate Down

DROP TABLE IF EXISTS sick_leaves;
DROP TABLE IF EXISTS referrals;
