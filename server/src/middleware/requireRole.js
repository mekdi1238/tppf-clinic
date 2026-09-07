const { ApiError } = require("./errorHandler");
const { query } = require("../db/pool");
const { ROLE_DEFAULTS, PERMISSION_DEFS, getRoutePermission } = require("../auth/permissions");

let cachedRoleDefaults = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 10000; // 10 seconds cache

async function getRoleDefaults() {
  const now = Date.now();
  if (cachedRoleDefaults && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedRoleDefaults;
  }
  try {
    const res = await query(`SELECT name, default_permissions FROM roles;`);
    const map = {};
    for (const row of res.rows) {
      if (Array.isArray(row.default_permissions)) {
        map[row.name] = row.default_permissions;
      } else if (typeof row.default_permissions === "string") {
        try {
          map[row.name] = JSON.parse(row.default_permissions);
        } catch (_) {
          map[row.name] = ROLE_DEFAULTS[row.name] || [];
        }
      } else {
        map[row.name] = ROLE_DEFAULTS[row.name] || [];
      }
    }
    cachedRoleDefaults = map;
    lastCacheTime = now;
    return cachedRoleDefaults;
  } catch (err) {
    return ROLE_DEFAULTS;
  }
}

function invalidateRoleDefaultsCache() {
  cachedRoleDefaults = null;
  lastCacheTime = 0;
}

function requireRole(...allowedRolesOrPerms) {
  return async function (req, res, next) {
    try {
      if (!req.user) {
        return next(new ApiError(401, "missing_token", "Authentication required."));
      }

      const userId = req.user.id;
      const userRoles = (req.user && req.user.roles) || [];

      // 1. Fetch live user permission overrides from database
      const permResult = await query(
        `SELECT permission, granted FROM user_permissions WHERE user_id = $1;`,
        [userId]
      );
      const overrides = new Map();
      for (const row of permResult.rows) {
        overrides.set(row.permission, row.granted);
      }

      // 2. Compute effective permissions (role defaults + overrides)
      const roleDefaultsMap = await getRoleDefaults();
      const effective = new Set();
      if (userRoles.includes("system_administrator")) {
        for (const p of PERMISSION_DEFS) effective.add(p);
      } else {
        for (const r of userRoles) {
          const defaults = roleDefaultsMap[r] || ROLE_DEFAULTS[r] || [];
          for (const p of defaults) effective.add(p);
        }
      }

      // Universal Reports access: Every authenticated user can view & export reports by default,
      // unless explicitly restricted by an admin (overrides.get(...) === false).
      if (overrides.get("nav.reports") !== false) {
        effective.add("nav.reports");
      }
      if (overrides.get("reports.export") !== false) {
        effective.add("reports.export");
      }

      // Apply explicit user overrides
      for (const [perm, granted] of overrides.entries()) {
        if (granted === true) effective.add(perm);
        else if (granted === false) effective.delete(perm);
      }

      // 3. Determine permission required for this request path & method
      const fullPath = (req.baseUrl || "") + (req.path || "");
      const routePerm = getRoutePermission(req.method, fullPath);

      // If the route maps to a specific granular permission:
      if (routePerm) {
        // Explicit revocation check
        if (overrides.get(routePerm) === false) {
          return next(new ApiError(403, "forbidden", "You do not have permission to perform this action."));
        }
        // Granted permission check
        if (effective.has(routePerm)) {
          return next();
        }
      }

      // Allow users with nav.reports to read reporting datasets for analytics and charts
      if (req.method === "GET" && effective.has("nav.reports") && overrides.get("nav.reports") !== false) {
        const isReportingPath = /^\/(patients|visits|registrations|certifications|admissions|lab-orders|drugs|lab-test-catalog|departments)/.test(req.path) ||
                                /^\/api\/v1\/(patients|visits|registrations|certifications|admissions|lab-orders|drugs|lab-test-catalog|departments)/.test(fullPath);
        if (isReportingPath && (!routePerm || overrides.get(routePerm) !== false)) {
          return next();
        }
      }

      // 4. Check if any explicitly specified permission in allowedRolesOrPerms is granted
      for (const item of allowedRolesOrPerms) {
        if (item.includes(".")) {
          if (overrides.get(item) === false) {
            return next(new ApiError(403, "forbidden", "You do not have permission to perform this action."));
          }
          if (effective.has(item)) {
            return next();
          }
        }
      }

      // 5. Fallback: Role-based check (if role matches and not revoked)
      const roleMatch = userRoles.some((role) => allowedRolesOrPerms.includes(role));
      if (roleMatch) {
        if (routePerm && overrides.get(routePerm) === false) {
          return next(new ApiError(403, "forbidden", "You do not have permission to perform this action."));
        }
        return next();
      }

      return next(new ApiError(403, "forbidden", "You do not have permission to perform this action."));
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireRole;
module.exports.invalidateRoleDefaultsCache = invalidateRoleDefaultsCache;
