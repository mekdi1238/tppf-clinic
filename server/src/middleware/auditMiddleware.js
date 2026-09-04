const { logAudit } = require("../services/auditLogger");

/**
 * Parses module name from the request path.
 */
function inferModule(path) {
  if (!path) return "general";
  const clean = path.replace(/^\/api\/v1\//, "").replace(/^\//, "");
  const firstPart = clean.split("/")[0] || "general";
  const moduleMap = {
    auth: "auth",
    patients: "patients",
    visits: "visits",
    vitals: "visits",
    admissions: "admissions",
    registrations: "registrations",
    certifications: "certifications",
    checkups: "checkups",
    "lab-orders": "laboratory",
    pharmacy: "pharmacy",
    drugs: "pharmacy",
    prescriptions: "pharmacy",
    referrals: "referrals",
    "sick-leaves": "referrals",
    users: "users",
    staff: "staff",
    settings: "settings",
    backups: "backups",
    "audit-logs": "audit_logs",
  };
  return moduleMap[firstPart] || firstPart;
}

/**
 * Infers primary database table name from path.
 */
function inferTableName(path) {
  if (!path) return null;
  const clean = path.replace(/^\/api\/v1\//, "").replace(/^\//, "");
  const firstPart = clean.split("/")[0] || "";
  const tableMap = {
    patients: "patients",
    visits: "visits",
    vitals: "vitals",
    admissions: "admissions",
    registrations: "employee_registrations",
    certifications: "medical_certifications",
    checkups: "patients",
    "lab-orders": "lab_orders",
    pharmacy: "prescriptions",
    drugs: "drugs",
    prescriptions: "prescriptions",
    referrals: "referrals",
    "sick-leaves": "sick_leaves",
    users: "users",
    staff: "patients",
    settings: "settings",
    backups: "database_backups",
  };
  return tableMap[firstPart] || firstPart || null;
}

/**
 * Extracts numeric record ID from URL if present.
 */
function inferRecordId(req) {
  if (req.params && req.params.id && !isNaN(Number(req.params.id))) {
    return Number(req.params.id);
  }
  const clean = (req.path || "").replace(/^\/api\/v1\//, "").replace(/^\//, "");
  const parts = clean.split("/");
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      return Number(part);
    }
  }
  return null;
}

/**
 * Creates human-readable action description from HTTP method and path.
 */
function buildDescription(req) {
  const method = req.method.toUpperCase();
  const path = req.originalUrl || req.url;
  const mod = inferModule(req.path);
  const recId = inferRecordId(req);

  if (method === "POST") return `Created record in ${mod}${recId ? ` (ID: ${recId})` : ""}`;
  if (method === "PUT" || method === "PATCH") return `Updated record in ${mod}${recId ? ` (ID: ${recId})` : ""}`;
  if (method === "DELETE") return `Deleted record in ${mod}${recId ? ` (ID: ${recId})` : ""}`;
  return `${method} ${path}`;
}

/**
 * Express middleware that automatically logs state-changing operations
 * if an explicit audit log was not already recorded by the route handler.
 */
function auditMiddleware(req, res, next) {
  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];
  if (!writeMethods.includes(req.method.toUpperCase())) {
    return next();
  }

  // Skip login endpoint (handled explicitly in auth.js with clean metadata)
  if (req.originalUrl && req.originalUrl.includes("/auth/login")) {
    return next();
  }

  res.on("finish", () => {
    // Only log successful operations and only if not explicitly logged by the route handler
    if (res.statusCode >= 200 && res.statusCode < 400 && !req._auditLogged) {
      const method = req.method.toUpperCase();
      const action = method === "POST" ? "create" : method === "DELETE" ? "delete" : "update";
      const moduleName = inferModule(req.path);
      const tableName = inferTableName(req.path);
      const recordId = inferRecordId(req);

      logAudit(req, {
        action,
        module: moduleName,
        tableName: tableName,
        recordId: recordId,
        description: buildDescription(req),
        afterData: method !== "DELETE" ? req.body : null,
      });
    }
  });

  next();
}

module.exports = auditMiddleware;
