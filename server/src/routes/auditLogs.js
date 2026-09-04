const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

const AUDIT_ACCESS = requireRole("system_administrator", "hr_admin");

/**
 * GET /api/v1/audit-logs
 * List audit logs with pagination and filters.
 */
router.get("/audit-logs", AUDIT_ACCESS, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
  const offset = (page - 1) * limit;

  const { search, module: moduleFilter, action, user_id, start_date, end_date } = req.query;

  const conditions = [];
  const params = [];

  if (search && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(`(
      lower(COALESCE(a.description, '')) LIKE $${params.length} OR
      lower(COALESCE(a.user_name, '')) LIKE $${params.length} OR
      lower(COALESCE(u.full_name, '')) LIKE $${params.length} OR
      lower(COALESCE(a.table_name, '')) LIKE $${params.length} OR
      lower(COALESCE(a.action, '')) LIKE $${params.length}
    )`);
  }

  if (moduleFilter && moduleFilter !== "all") {
    params.push(moduleFilter);
    conditions.push(`a.module = $${params.length}`);
  }

  if (action && action !== "all") {
    params.push(action);
    conditions.push(`a.action = $${params.length}`);
  }

  if (user_id && user_id !== "all") {
    params.push(parseInt(user_id, 10));
    conditions.push(`a.user_id = $${params.length}`);
  }

  if (start_date) {
    params.push(`${start_date} 00:00:00`);
    conditions.push(`a.performed_at >= $${params.length}::timestamptz`);
  }

  if (end_date) {
    params.push(`${end_date} 23:59:59.999`);
    conditions.push(`a.performed_at <= $${params.length}::timestamptz`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total records
  const countSql = `
    SELECT COUNT(*) AS total
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ${whereClause};
  `;
  const countRes = await query(countSql, params);
  const total = parseInt(countRes.rows[0].total, 10) || 0;

  // Fetch paginated records
  const dataSql = `
    SELECT 
      a.id,
      a.user_id,
      COALESCE(a.user_name, u.username) AS user_name,
      u.full_name AS user_full_name,
      a.action,
      a.module,
      a.table_name,
      a.record_id,
      a.description,
      a.before_data,
      a.after_data,
      a.ip_address,
      a.performed_at
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ${whereClause}
    ORDER BY a.performed_at DESC, a.id DESC
    LIMIT $${params.length + 1} OFFSET $${params.length + 2};
  `;

  const dataRes = await query(dataSql, [...params, limit, offset]);

  res.json({
    data: dataRes.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  });
}));

/**
 * GET /api/v1/audit-logs/filters
 * Metadata for filter dropdowns (distinct modules, actions, and list of users).
 */
router.get("/audit-logs/filters", AUDIT_ACCESS, asyncHandler(async (req, res) => {
  const [modulesRes, actionsRes, usersRes] = await Promise.all([
    query(`SELECT DISTINCT module FROM audit_log WHERE module IS NOT NULL ORDER BY module ASC;`),
    query(`SELECT DISTINCT action FROM audit_log WHERE action IS NOT NULL ORDER BY action ASC;`),
    query(`SELECT id, username, full_name FROM users ORDER BY username ASC;`),
  ]);

  res.json({
    modules: modulesRes.rows.map((r) => r.module),
    actions: actionsRes.rows.map((r) => r.action),
    users: usersRes.rows,
  });
}));

/**
 * GET /api/v1/audit-logs/stats
 * Overview analytics for the audit dashboard.
 */
router.get("/audit-logs/stats", AUDIT_ACCESS, asyncHandler(async (req, res) => {
  const [totalRes, todayRes, moduleBreakdown, topUsers] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM audit_log;`),
    query(`SELECT COUNT(*) AS total_today FROM audit_log WHERE performed_at >= date_trunc('day', now());`),
    query(`
      SELECT module, COUNT(*) as count 
      FROM audit_log 
      GROUP BY module 
      ORDER BY count DESC 
      LIMIT 6;
    `),
    query(`
      SELECT 
        COALESCE(a.user_name, u.username, 'System') AS username,
        u.full_name,
        COUNT(*) as action_count
      FROM audit_log a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.performed_at >= now() - INTERVAL '7 days'
      GROUP BY a.user_name, u.username, u.full_name
      ORDER BY action_count DESC
      LIMIT 5;
    `),
  ]);

  res.json({
    total: parseInt(totalRes.rows[0]?.total || 0, 10),
    today: parseInt(todayRes.rows[0]?.total_today || 0, 10),
    moduleBreakdown: moduleBreakdown.rows,
    topUsers: topUsers.rows,
  });
}));

/**
 * GET /api/v1/audit-logs/:id
 * Retrieve a single audit log with full diff details.
 */
router.get("/audit-logs/:id", AUDIT_ACCESS, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT 
       a.*,
       COALESCE(a.user_name, u.username) AS user_name,
       u.full_name AS user_full_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     WHERE a.id = $1;`,
    [req.params.id]
  );

  const log = result.rows[0];
  if (!log) {
    throw new ApiError(404, "audit_log_not_found", "Audit log record not found.");
  }

  res.json(log);
}));

module.exports = router;
