-- Migration 0002: Identity & Access
-- Depends on: physicians (0001).
-- Maps to Entity Dictionary section 1.

-- +migrate Up

CREATE TABLE users (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username       TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    full_name      TEXT,
    -- Nullable on purpose: a user is a login, a physician is a clinical
    -- person. Not every physician needs a login (reception may enter data
    -- on their behalf), and not every login belongs to a physician
    -- (receptionists, pharmacists, etc. are users but not physicians).
    physician_id   INTEGER REFERENCES physicians(id),
    is_active      BOOLEAN NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);
COMMENT ON COLUMN users.password_hash IS 'Never store plaintext. This column holds a bcrypt/argon2 hash, produced by the auth module on Day 3 — the direct fix for the old Access system''s plaintext, hardcoded credentials.';

CREATE TABLE user_roles (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);
COMMENT ON TABLE user_roles IS 'Many-to-many: one user account can hold multiple roles at once (e.g. Receptionist and HR/Admin). ON DELETE CASCADE here is deliberate and safe: this table only records an assignment, not clinical data, so cleaning up assignments when a user or role is removed is correct behaviour, unlike clinical tables where we never want an automatic cascade delete.';

CREATE TABLE audit_log (
    id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id      INTEGER REFERENCES users(id),
    action       TEXT NOT NULL,
    table_name   TEXT NOT NULL,
    record_id    INTEGER,
    before_data  JSONB,
    after_data   JSONB,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_audit_log_action CHECK (action IN ('create', 'update', 'delete'))
);
COMMENT ON TABLE audit_log IS 'Cross-cutting: every clinical create/update/delete gets a row here. JSONB (not JSON) is used for before/after snapshots because it is stored in a parsed binary form Postgres can index and query efficiently, not just a text blob.';

-- Index on user_id because audit_log will very commonly be queried as
-- "show me everything this user did" — Postgres does NOT automatically
-- index foreign key columns (only the referenced side, via the primary
-- key, gets an index for free), so this has to be added explicitly.
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_table_record ON audit_log(table_name, record_id);

-- +migrate Down

DROP TABLE IF EXISTS audit_log;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS users;
