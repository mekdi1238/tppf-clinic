const { query } = require("../db/pool");
const logger = require("../utils/logger");

/**
 * Sanitizes data to prevent sensitive fields (passwords, tokens) from being stored in audit logs.
 */
function sanitizeData(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeData);

  const sanitized = { ...data };
  const sensitiveKeys = ["password", "password_hash", "token", "jwt", "new_password", "current_password"];
  for (const key of Object.keys(sanitized)) {
    if (sensitiveKeys.includes(key.toLowerCase())) {
      sanitized[key] = "********";
    } else if (typeof sanitized[key] === "object" && sanitized[key] !== null) {
      sanitized[key] = sanitizeData(sanitized[key]);
    }
  }
  return sanitized;
}

/**
 * Extracts client IP address from Express request.
 */
function getClientIp(req) {
  if (!req) return null;
  if (typeof req === "string") return req;
  const forwarded = req.headers ? req.headers["x-forwarded-for"] : null;
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || null;
}

/**
 * Core function to record an audit log entry.
 *
 * @param {Object|null} reqOrContext - Express `req` object OR `{ userId, userName, ipAddress }`
 * @param {Object} options
 * @param {string} options.action - e.g. 'create', 'update', 'delete', 'login', 'dispense', 'import', etc.
 * @param {string} [options.module] - e.g. 'patients', 'visits', 'laboratory', 'pharmacy', 'users', etc.
 * @param {string} [options.tableName] - Database table affected, e.g. 'patients', 'visits'
 * @param {number|string} [options.recordId] - ID of the primary record
 * @param {string} [options.description] - Human-readable summary of the action
 * @param {Object} [options.beforeData] - Snapshot before change
 * @param {Object} [options.afterData] - Snapshot after change
 * @param {Object} [options.client] - Optional pg client for running within an active transaction
 */
async function logAudit(reqOrContext, {
  action,
  module = "general",
  tableName = null,
  recordId = null,
  description = null,
  beforeData = null,
  afterData = null,
  client = null,
} = {}) {
  try {
    let userId = null;
    let userName = null;
    let ipAddress = null;

    if (reqOrContext && typeof reqOrContext === "object") {
      reqOrContext._auditLogged = true;
      if (reqOrContext.user) {
        userId = reqOrContext.user.id || null;
        userName = reqOrContext.user.username || reqOrContext.user.full_name || null;
        ipAddress = getClientIp(reqOrContext);
      } else {
        userId = reqOrContext.userId || reqOrContext.user_id || null;
        userName = reqOrContext.userName || reqOrContext.username || reqOrContext.user_name || null;
        ipAddress = reqOrContext.ipAddress || reqOrContext.ip_address || getClientIp(reqOrContext);
      }
    }

    const safeBefore = beforeData ? JSON.stringify(sanitizeData(beforeData)) : null;
    const safeAfter = afterData ? JSON.stringify(sanitizeData(afterData)) : null;
    const parsedRecordId = recordId && !isNaN(Number(recordId)) ? Number(recordId) : null;

    const sql = `
      INSERT INTO audit_log (
        user_id,
        user_name,
        action,
        module,
        table_name,
        record_id,
        description,
        before_data,
        after_data,
        ip_address,
        performed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      RETURNING id;
    `;

    const values = [
      userId,
      userName,
      action || "unknown",
      module || "general",
      tableName || null,
      parsedRecordId,
      description || null,
      safeBefore,
      safeAfter,
      ipAddress,
    ];

    if (client) {
      await client.query(sql, values);
    } else {
      await query(sql, values);
    }
  } catch (err) {
    // Fail-safe: Audit logging failure should not crash or break business transactions
    logger.warn(`Failed to write to audit_log: ${err.message}`, { action, module, tableName, recordId });
  }
}

module.exports = {
  logAudit,
  sanitizeData,
};
