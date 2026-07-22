const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { ApiError } = require("../middleware/errorHandler");
const { hashPassword, verifyPassword } = require("../auth/passwordHash");

const router = express.Router();
router.use(requireAuth);

async function embedRoles(user) {
  const roles = await query(
    `SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1;`,
    [user.id]
  );
  const { password_hash, ...rest } = user;
  return { ...rest, roles: roles.rows };
}

async function setUserRoles(userId, roleIds) {
  await query(`DELETE FROM user_roles WHERE user_id = $1;`, [userId]);
  for (const roleId of roleIds) {
    await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2);`, [userId, roleId]);
  }
}

router.get("/roles", asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM roles ORDER BY display_name;`);
  res.json(result.rows);
}));

router.get("/users", asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(username) LIKE $${params.length} OR lower(full_name) LIKE $${params.length})`);
  }
  if (status === "active") conditions.push(`is_active = true`);
  if (status === "inactive") conditions.push(`is_active = false`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(`SELECT * FROM users ${where} ORDER BY username;`, params);
  const withRoles = await Promise.all(result.rows.map(embedRoles));
  res.json(withRoles);
}));

router.post("/users", asyncHandler(async (req, res) => {
  const { username, password, full_name, physician_id, role_ids } = req.body;
  if (!username || !username.trim()) throw new ApiError(422, "username_required", "Username is required.");
  if (!password || password.length < 6) throw new ApiError(422, "password_too_short", "Password must be at least 6 characters.");
  if (!Array.isArray(role_ids) || !role_ids.length) throw new ApiError(422, "roles_required", "Assign at least one role.");

  const existing = await query(`SELECT id FROM users WHERE username = $1;`, [username.trim()]);
  if (existing.rows[0]) throw new ApiError(422, "username_taken", "That username is already taken.");

  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (username, password_hash, full_name, physician_id)
     VALUES ($1, $2, $3, $4) RETURNING *;`,
    [username.trim(), passwordHash, full_name || null, physician_id || null]
  );
  await setUserRoles(result.rows[0].id, role_ids);
  res.status(201).json(await embedRoles(result.rows[0]));
}));

router.put("/users/:id", asyncHandler(async (req, res) => {
  const current = await query(`SELECT * FROM users WHERE id = $1;`, [req.params.id]);
  const user = current.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");

  const { full_name, physician_id, role_ids, is_active } = req.body;

  if (is_active === false && user.username === "admin") {
    throw new ApiError(422, "admin_protected", "The built-in admin account cannot be deactivated.");
  }
  if (role_ids !== undefined && (!Array.isArray(role_ids) || !role_ids.length)) {
    throw new ApiError(422, "roles_required", "Assign at least one role.");
  }

  const result = await query(
    `UPDATE users SET
       full_name = COALESCE($1, full_name),
       physician_id = $2,
       is_active = COALESCE($3, is_active)
     WHERE id = $4
     RETURNING *;`,
    [
      full_name !== undefined ? full_name : null,
      physician_id !== undefined ? physician_id : user.physician_id,
      is_active !== undefined ? is_active : null,
      req.params.id,
    ]
  );
  if (role_ids !== undefined) await setUserRoles(req.params.id, role_ids);
  res.json(await embedRoles(result.rows[0]));
}));

router.post("/users/:id/reset-password", asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) throw new ApiError(422, "password_too_short", "Password must be at least 6 characters.");

  const passwordHash = await hashPassword(password);
  const result = await query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id;`, [passwordHash, req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "user_not_found", "User not found.");
  res.json({ ok: true });
}));

router.post("/users/:id/change-password", asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    throw new ApiError(422, "password_too_short", "New password must be at least 6 characters.");
  }

  const result = await query(`SELECT * FROM users WHERE id = $1;`, [req.params.id]);
  const user = result.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");

  const matches = await verifyPassword(current_password || "", user.password_hash);
  if (!matches) throw new ApiError(401, "wrong_password", "Current password is incorrect.");

  const passwordHash = await hashPassword(new_password);
  await query(`UPDATE users SET password_hash = $1 WHERE id = $2;`, [passwordHash, req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
