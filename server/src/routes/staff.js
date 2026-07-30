const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(requireAuth);

// GET /staff — list all clinic staff, filterable by department and search
router.get("/staff", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist"), asyncHandler(async (req, res) => {
  const { search, department, active } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(s.full_name) LIKE $${params.length} OR lower(s.staff_code) LIKE $${params.length} OR lower(s.position) LIKE $${params.length})`
    );
  }
  if (department && department !== "all") {
    params.push(department);
    conditions.push(`s.department = $${params.length}`);
  }
  if (active === "true") conditions.push(`s.is_active = true`);
  if (active === "false") conditions.push(`s.is_active = false`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await query(
    `SELECT
       s.*,
       er.registration_code,
       er.occupation AS registered_occupation
     FROM clinic_staff s
     JOIN employee_registrations er ON er.id = s.source_employee_registration_id
     ${where}
     ORDER BY s.created_at DESC;`,
    params
  );
  res.json(result.rows);
}));

// GET /staff/:id — single staff record with source registration
router.get("/staff/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist"), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT
       s.*,
       row_to_json(er.*) AS source_registration
     FROM clinic_staff s
     JOIN employee_registrations er ON er.id = s.source_employee_registration_id
     WHERE s.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) {
    return res.status(404).json({ code: "staff_not_found", message: "Staff record not found." });
  }
  res.json(result.rows[0]);
}));

module.exports = router;
