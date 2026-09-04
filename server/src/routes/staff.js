const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");

const router = express.Router();
router.use(requireAuth);

// GET /staff — list all clinic staff, filterable by department and search
router.get("/staff", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist", "department_hr"), asyncHandler(async (req, res) => {
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
router.get("/staff/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist", "department_hr"), asyncHandler(async (req, res) => {
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

// GET /staff/:id/medical-record — comprehensive HR view for an employee
router.get("/staff/:id/medical-record", requireRole("system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  const patientId = req.params.id;

  // 1. Patient info & checkup status
  const patientResult = await query(
    `SELECT id, full_name, patient_code, department, position, is_active, 
            last_fitness_exam_date, next_checkup_due_date, fitness_status,
            (next_checkup_due_date - CURRENT_DATE) AS days_remaining
     FROM patients WHERE id = $1;`,
    [patientId]
  );
  const patient = patientResult.rows[0];
  if (!patient) return res.status(404).json({ code: "patient_not_found", message: "Patient not found." });

  // 2. Active/Recent Sick Leaves (last 365 days or active)
  const sickLeavesResult = await query(
    `SELECT sl.*, ph.full_name as physician_name
     FROM sick_leaves sl
     LEFT JOIN physicians ph ON sl.physician_id = ph.id
     WHERE sl.patient_id = $1 
       AND sl.leave_start >= CURRENT_DATE - INTERVAL '365 days'
     ORDER BY sl.leave_start DESC;`,
    [patientId]
  );

  // 3. Physician Advice Notes (hr_note is not null)
  const notesResult = await query(
    `SELECT v.id, v.visit_date, v.hr_note, v.chief_complaint, ph.full_name as physician_name
     FROM visits v
     LEFT JOIN physicians ph ON v.physician_id = ph.id
     WHERE v.patient_id = $1 
       AND v.hr_note IS NOT NULL 
       AND v.hr_note != ''
     ORDER BY v.visit_date DESC
     LIMIT 50;`,
    [patientId]
  );

  res.json({
    patient,
    sick_leaves: sickLeavesResult.rows,
    hr_notes: notesResult.rows
  });
}));

module.exports = router;
