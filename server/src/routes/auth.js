const express = require("express");
const { query } = require("../db/pool");
const { verifyPassword } = require("../auth/passwordHash");
const { signToken } = require("../auth/jwt");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const router = express.Router();

router.post("/auth/login", async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      throw new ApiError(422, "missing_credentials", "Please enter both your username and password.");
    }

    let userResult;
    try {
      userResult = await query(
        `SELECT id, username, password_hash, full_name, physician_id, is_active, photo_url
         FROM users WHERE username = $1;`,
        [username]
      );
    } catch (err) {
      userResult = await query(
        `SELECT id, username, password_hash, full_name, physician_id, is_active
         FROM users WHERE username = $1;`,
        [username]
      );
    }
    const user = userResult.rows[0];

    if (!user) {
      throw new ApiError(401, "invalid_credentials", "Invalid username or password.");
    }
    if (!user.is_active) {
      throw new ApiError(403, "account_deactivated", "This account has been deactivated.");
    }

    const passwordMatches = await verifyPassword(password, user.password_hash);
    if (!passwordMatches) {
      throw new ApiError(401, "invalid_credentials", "Invalid username or password.");
    }

    const roleResult = await query(
      `SELECT r.name, r.display_name
       FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1;`,
      [user.id]
    );
    const roleNames = roleResult.rows.map((r) => r.name);
    const roleDisplayNames = roleResult.rows.map((r) => r.display_name);

    await query(`UPDATE users SET last_login_at = now() WHERE id = $1;`, [user.id]);

    await logAudit(
      { userId: user.id, userName: user.username, ipAddress: req.ip || req.connection?.remoteAddress },
      {
        action: "login",
        module: "auth",
        tableName: "users",
        recordId: user.id,
        description: `User '${user.username}' logged in successfully`,
      }
    );

    // Fetch per-user permission overrides
    const permResult = await query(
      `SELECT permission, granted FROM user_permissions WHERE user_id = $1;`,
      [user.id]
    );
    const customPermissions = {};
    for (const row of permResult.rows) {
      customPermissions[row.permission] = row.granted;
    }

    const token = signToken({ id: user.id, username: user.username, roles: roleNames });

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name,
        photo_url: user.photo_url || null,
        roles: roleDisplayNames,
        physician_id: user.physician_id || null,
        custom_permissions: customPermissions,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
