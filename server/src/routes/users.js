const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { hashPassword, verifyPassword } = require("../auth/passwordHash");

const ADMIN_ONLY = requireRole("system_administrator", "hr_admin");

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

router.get("/profile", asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM users WHERE id = $1;`, [req.user.id]);
  const user = result.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");
  res.json(await embedRoles(user));
}));

router.put("/profile", asyncHandler(async (req, res) => {
  const current = await query(`SELECT * FROM users WHERE id = $1;`, [req.user.id]);
  const user = current.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");

  const { username, full_name, current_password, new_password } = req.body;

  if (username !== undefined) {
    if (!username || !username.trim()) throw new ApiError(422, "username_required", "Username is required.");
    if (username.trim() !== user.username) {
      const existing = await query(`SELECT id FROM users WHERE username = $1 AND id != $2;`, [username.trim(), req.user.id]);
      if (existing.rows[0]) throw new ApiError(422, "username_taken", "That username is already taken.");
    }
  }

  let newPasswordHash = null;
  if (new_password) {
    if (new_password.length < 6) throw new ApiError(422, "password_too_short", "New password must be at least 6 characters.");
    if (current_password) {
      const matches = await verifyPassword(current_password, user.password_hash);
      if (!matches) throw new ApiError(401, "wrong_password", "Current password is incorrect.");
    }
    newPasswordHash = await hashPassword(new_password);
  }

  const result = await query(
    `UPDATE users SET
       username = COALESCE($1, username),
       full_name = COALESCE($2, full_name),
       password_hash = COALESCE($3, password_hash)
     WHERE id = $4
     RETURNING *;`,
    [
      username !== undefined ? username.trim() : null,
      full_name !== undefined ? full_name : null,
      newPasswordHash,
      req.user.id,
    ]
  );

  const updatedUser = await embedRoles(result.rows[0]);
  res.json(updatedUser);
}));

router.get("/roles", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM roles ORDER BY display_name;`);
  res.json(result.rows);
}));

router.get("/users", ADMIN_ONLY, asyncHandler(async (req, res) => {
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

router.post("/users", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { username, password, full_name, physician_id, role_ids, department } = req.body;
  if (!username || !username.trim()) throw new ApiError(422, "username_required", "Username is required.");
  if (!password || password.length < 6) throw new ApiError(422, "password_too_short", "Password must be at least 6 characters.");
  if (!Array.isArray(role_ids) || !role_ids.length) throw new ApiError(422, "roles_required", "Assign at least one role.");

  const existing = await query(`SELECT id FROM users WHERE username = $1;`, [username.trim()]);
  if (existing.rows[0]) throw new ApiError(422, "username_taken", "That username is already taken.");

  const passwordHash = await hashPassword(password);
  const result = await query(
    `INSERT INTO users (username, password_hash, full_name, physician_id, department)
     VALUES ($1, $2, $3, $4, $5) RETURNING *;`,
    [username.trim(), passwordHash, full_name || null, physician_id || null, department ? department.trim() : null]
  );
  await setUserRoles(result.rows[0].id, role_ids);
  res.status(201).json(await embedRoles(result.rows[0]));
}));

router.put("/users/:id", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const current = await query(`SELECT * FROM users WHERE id = $1;`, [req.params.id]);
  const user = current.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");

  const { username, password, full_name, physician_id, role_ids, is_active, department } = req.body;

  if (is_active === false && user.username === "admin") {
    throw new ApiError(422, "admin_protected", "The built-in admin account cannot be deactivated.");
  }
  if (role_ids !== undefined && (!Array.isArray(role_ids) || !role_ids.length)) {
    throw new ApiError(422, "roles_required", "Assign at least one role.");
  }
  if (username !== undefined) {
    if (!username || !username.trim()) throw new ApiError(422, "username_required", "Username is required.");
    if (username.trim() !== user.username) {
      const existing = await query(`SELECT id FROM users WHERE username = $1 AND id != $2;`, [username.trim(), req.params.id]);
      if (existing.rows[0]) throw new ApiError(422, "username_taken", "That username is already taken.");
    }
  }
  if (password !== undefined && password !== "") {
    if (password.length < 6) throw new ApiError(422, "password_too_short", "Password must be at least 6 characters.");
  }

  // Hash new password if provided
  let newPasswordHash = null;
  if (password !== undefined && password !== "") {
    newPasswordHash = await hashPassword(password);
  }

  const result = await query(
    `UPDATE users SET
       username = COALESCE($1, username),
       full_name = COALESCE($2, full_name),
       physician_id = $3,
       is_active = COALESCE($4, is_active),
       password_hash = COALESCE($5, password_hash),
       department = $6
     WHERE id = $7
     RETURNING *;`,
    [
      username !== undefined ? username.trim() : null,
      full_name !== undefined ? full_name : null,
      physician_id !== undefined ? physician_id : user.physician_id,
      is_active !== undefined ? is_active : null,
      newPasswordHash,
      department !== undefined ? (department ? department.trim() : null) : user.department,
      req.params.id,
    ]
  );
  if (role_ids !== undefined) await setUserRoles(req.params.id, role_ids);
  res.json(await embedRoles(result.rows[0]));
}));

router.post("/users/:id/reset-password", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) throw new ApiError(422, "password_too_short", "Password must be at least 6 characters.");

  const passwordHash = await hashPassword(password);
  const result = await query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id;`, [passwordHash, req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "user_not_found", "User not found.");
  res.json({ ok: true });
}));

router.post("/users/:id/change-password", asyncHandler(async (req, res) => {
  if (String(req.user.id) !== String(req.params.id)) {
    throw new ApiError(403, "forbidden", "You can only change your own password.");
  }
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
