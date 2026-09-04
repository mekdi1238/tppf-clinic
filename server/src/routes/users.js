const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { hashPassword, verifyPassword } = require("../auth/passwordHash");
const { logAudit } = require("../services/auditLogger");

const ADMIN_ONLY = requireRole("system_administrator", "hr_admin");

const router = express.Router();
router.use(requireAuth);

async function embedRoles(user) {
  const roles = await query(
    `SELECT r.* FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = $1;`,
    [user.id]
  );
  const permResult = await query(
    `SELECT permission, granted FROM user_permissions WHERE user_id = $1;`,
    [user.id]
  );
  const customPermissions = {};
  for (const row of permResult.rows) {
    customPermissions[row.permission] = row.granted;
  }
  const { password_hash, ...rest } = user;
  return { ...rest, roles: roles.rows, custom_permissions: customPermissions };
}

async function setUserRoles(userId, roleIds) {
  await query(`DELETE FROM user_roles WHERE user_id = $1;`, [userId]);
  for (const roleId of roleIds) {
    await query(`INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2);`, [userId, roleId]);
  }
}

async function setUserPermissions(userId, customPermissions) {
  await query(`DELETE FROM user_permissions WHERE user_id = $1;`, [userId]);
  if (!customPermissions || typeof customPermissions !== 'object') return;
  for (const [permission, granted] of Object.entries(customPermissions)) {
    if (typeof granted === 'boolean') {
      await query(
        `INSERT INTO user_permissions (user_id, permission, granted) VALUES ($1, $2, $3);`,
        [userId, permission, granted]
      );
    }
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

  const { username, full_name, photo_url, current_password, new_password } = req.body;

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

  let updatedUser;
  try {
    const result = await query(
      `UPDATE users SET
         username = COALESCE($1, username),
         full_name = COALESCE($2, full_name),
         photo_url = CASE WHEN $3::boolean THEN $4 ELSE photo_url END,
         password_hash = COALESCE($5, password_hash)
       WHERE id = $6
       RETURNING *;`,
      [
        username !== undefined ? username.trim() : null,
        full_name !== undefined ? full_name : null,
        photo_url !== undefined,
        photo_url || null,
        newPasswordHash,
        req.user.id,
      ]
    );
    updatedUser = result.rows[0];
  } catch (err) {
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
    updatedUser = result.rows[0];
  }

  res.json(await embedRoles(updatedUser));
}));

router.get("/roles", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM roles ORDER BY id ASC;`);
  res.json(result.rows);
}));

router.put("/roles/:id", requireRole("system_administrator"), asyncHandler(async (req, res) => {
  const roleId = req.params.id;
  const currentRes = await query(`SELECT * FROM roles WHERE id = $1;`, [roleId]);
  const currentRole = currentRes.rows[0];
  if (!currentRole) throw new ApiError(404, "role_not_found", "Role not found.");

  const { display_name, description, default_permissions } = req.body;

  if (display_name !== undefined && (!display_name || !display_name.trim())) {
    throw new ApiError(422, "display_name_required", "Role display name is required.");
  }

  let permsJson = currentRole.default_permissions;
  if (default_permissions !== undefined) {
    if (!Array.isArray(default_permissions)) {
      throw new ApiError(422, "invalid_permissions", "default_permissions must be an array of permission keys.");
    }
    permsJson = JSON.stringify(default_permissions);
  }

  const result = await query(
    `UPDATE roles
     SET display_name = COALESCE($1, display_name),
         description = COALESCE($2, description),
         default_permissions = COALESCE($3::jsonb, default_permissions)
     WHERE id = $4
     RETURNING *;`,
    [
      display_name ? display_name.trim() : null,
      description !== undefined ? description : null,
      permsJson,
      roleId,
    ]
  );

  const updatedRole = result.rows[0];
  if (requireRole.invalidateRoleDefaultsCache) {
    requireRole.invalidateRoleDefaultsCache();
  }

  await logAudit(req, {
    action: "update",
    module: "users",
    tableName: "roles",
    recordId: roleId,
    description: `Updated predefined role '${updatedRole.display_name || updatedRole.name}' default permissions`,
    beforeData: currentRole,
    afterData: updatedRole,
  });

  res.json(updatedRole);
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

const { syncPhysicians } = require("../services/physicianSync");

router.post("/users", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { username, password, full_name, physician_id, role_ids, department, custom_permissions } = req.body;
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
  if (custom_permissions) await setUserPermissions(result.rows[0].id, custom_permissions);
  await syncPhysicians();

  const newUser = result.rows[0];
  await logAudit(req, {
    action: "create",
    module: "users",
    tableName: "users",
    recordId: newUser.id,
    description: `Created user account '${newUser.username}' (${newUser.full_name || 'No full name'})`,
    afterData: newUser,
  });

  res.status(201).json(await embedRoles(newUser));
}));

router.put("/users/:id", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const current = await query(`SELECT * FROM users WHERE id = $1;`, [req.params.id]);
  const user = current.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");

  const { username, password, full_name, physician_id, role_ids, is_active, department, custom_permissions } = req.body;

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
  if (custom_permissions !== undefined) await setUserPermissions(req.params.id, custom_permissions);
  await syncPhysicians();

  const updatedUser = result.rows[0];
  await logAudit(req, {
    action: "update",
    module: "users",
    tableName: "users",
    recordId: updatedUser.id,
    description: `Updated user account '${updatedUser.username}' (Active: ${updatedUser.is_active})`,
    beforeData: user,
    afterData: updatedUser,
  });

  res.json(await embedRoles(updatedUser));
}));

router.post("/users/:id/reset-password", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) throw new ApiError(422, "password_too_short", "Password must be at least 6 characters.");

  const targetUserRes = await query(`SELECT username FROM users WHERE id = $1;`, [req.params.id]);
  const targetUsername = targetUserRes.rows[0]?.username || `#${req.params.id}`;

  const passwordHash = await hashPassword(password);
  const result = await query(`UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id;`, [passwordHash, req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "user_not_found", "User not found.");

  await logAudit(req, {
    action: "update",
    module: "users",
    tableName: "users",
    recordId: Number(req.params.id),
    description: `Reset password for user '${targetUsername}'`,
  });

  res.json({ ok: true });
}));

router.delete("/users/:id", ADMIN_ONLY, asyncHandler(async (req, res) => {
  const targetId = req.params.id;
  const userRes = await query(`SELECT * FROM users WHERE id = $1;`, [targetId]);
  const user = userRes.rows[0];
  if (!user) throw new ApiError(404, "user_not_found", "User not found.");

  if (user.username === "admin") {
    throw new ApiError(422, "cannot_delete_admin", "The built-in admin account cannot be deleted.");
  }
  if (String(req.user.id) === String(targetId)) {
    throw new ApiError(422, "cannot_delete_self", "You cannot delete your own logged-in user account.");
  }

  // Clear foreign key references on historical records
  await query(`UPDATE audit_log SET user_id = NULL WHERE user_id = $1;`, [targetId]);
  await query(`UPDATE vitals SET recorded_by = NULL WHERE recorded_by = $1;`, [targetId]);
  await query(`UPDATE admission_notes SET recorded_by = NULL WHERE recorded_by = $1;`, [targetId]);
  await query(`UPDATE lab_order_items SET entered_by = NULL WHERE entered_by = $1;`, [targetId]);
  await query(`UPDATE dispensing_records SET dispensed_by = NULL WHERE dispensed_by = $1;`, [targetId]);
  await query(`UPDATE clinic_staff SET accepted_by_user_id = NULL WHERE accepted_by_user_id = $1;`, [targetId]);
  await query(`DELETE FROM user_roles WHERE user_id = $1;`, [targetId]);
  await query(`DELETE FROM user_permissions WHERE user_id = $1;`, [targetId]);
  await query(`DELETE FROM users WHERE id = $1;`, [targetId]);
  await syncPhysicians();

  await logAudit(req, {
    action: "delete",
    module: "users",
    tableName: "users",
    recordId: Number(targetId),
    description: `Deleted user account '${user.username}'`,
    beforeData: user,
  });

  res.json({ ok: true, id: targetId });
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
