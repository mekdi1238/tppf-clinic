-- Migration 0027: Per-user granular permissions
-- Stores explicit permission overrides per user.
-- If a row exists with granted = true, the permission is explicitly granted (added beyond role defaults).
-- If a row exists with granted = false, the permission is explicitly revoked (removed from role defaults).
-- If no row exists for a given user+permission, the permission follows the role default.

-- +migrate Up

CREATE TABLE user_permissions (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission  TEXT NOT NULL,
    granted     BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, permission)
);

CREATE INDEX idx_user_permissions_user_id ON user_permissions(user_id);

-- +migrate Down

DROP TABLE IF EXISTS user_permissions;
