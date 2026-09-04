const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const CHECKUP_READ = requireRole("receptionist", "physician", "system_administrator", "hr_admin", "department_hr");
const CHECKUP_WRITE = requireRole("receptionist", "physician", "system_administrator", "hr_admin", "department_hr");

const router = express.Router();
router.use(requireAuth);

// GET /api/checkups/due — List active employees whose 6-month fit card is due within 7 days or overdue
router.get("/checkups/due", CHECKUP_READ, asyncHandler(async (req, res) => {
  const { department } = req.query;
  const conditions = ["p.is_active = true", "p.next_checkup_due_date <= CURRENT_DATE + INTERVAL '7 days'"];
  const params = [];

  if (department && department !== "all") {
    params.push(department);
    conditions.push(`LOWER(p.department) = LOWER($${params.length})`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const result = await query(
    `SELECT p.*,
            (p.next_checkup_due_date - CURRENT_DATE) AS days_remaining,
            CASE 
              WHEN p.next_checkup_due_date < CURRENT_DATE THEN 'overdue'
              ELSE 'due_soon'
            END AS urgency
     FROM patients p
     ${where}
     ORDER BY p.next_checkup_due_date ASC;`,
    params
  );

  res.json(result.rows);
}));

// GET /api/checkups/all — List all active employees with 6-month fitness card status
router.get("/checkups/all", CHECKUP_READ, asyncHandler(async (req, res) => {
  const { search, department, status } = req.query;
  const conditions = ["p.is_active = true"];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(LOWER(p.full_name) LIKE $${params.length} OR LOWER(p.patient_code) LIKE $${params.length})`);
  }
  if (department && department !== "all") {
    params.push(department);
    conditions.push(`LOWER(p.department) = LOWER($${params.length})`);
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const result = await query(
    `SELECT p.*,
            cert.id AS latest_certificate_id,
            cert.examination_date AS certificate_exam_date,
            cert.result AS certificate_result,
            (cert.id IS NOT NULL OR p.last_fitness_exam_date IS NOT NULL) AS has_certificate,
            (p.next_checkup_due_date - CURRENT_DATE) AS days_remaining,
            CASE 
              WHEN cert.id IS NULL AND p.last_fitness_exam_date IS NULL THEN 'no_certificate'
              WHEN p.next_checkup_due_date < CURRENT_DATE THEN 'overdue'
              WHEN p.next_checkup_due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
              ELSE 'active_fit'
            END AS checkup_status
     FROM patients p
     LEFT JOIN LATERAL (
       SELECT c.id, c.examination_date, c.result
       FROM medical_certifications c
       WHERE c.patient_id = p.id OR (p.source_employee_registration_id IS NOT NULL AND c.employee_registration_id = p.source_employee_registration_id)
       ORDER BY c.examination_date DESC, c.id DESC
       LIMIT 1
     ) cert ON true
     ${where}
     ORDER BY (cert.id IS NOT NULL OR p.last_fitness_exam_date IS NOT NULL) ASC, p.next_checkup_due_date ASC NULLS FIRST;`,
    params
  );

  let rows = result.rows;
  if (status && status !== "all") {
    if (status === "active_fit") {
      rows = rows.filter(r => r.checkup_status === "active_fit" && r.fitness_status !== "renewal_visit_created");
    } else if (status === "due_soon") {
      rows = rows.filter(r => r.checkup_status === "due_soon");
    } else if (status === "overdue") {
      rows = rows.filter(r => r.checkup_status === "overdue");
    } else if (status === "no_certificate") {
      rows = rows.filter(r => r.checkup_status === "no_certificate");
    } else if (status === "renewal_visit_created") {
      rows = rows.filter(r => r.fitness_status === "renewal_visit_created");
    }
  }

  res.json(rows);
}));

// POST /api/checkups/dispatch-renewal — Create a renewal visit for 6-month examination
router.post("/checkups/dispatch-renewal", CHECKUP_WRITE, asyncHandler(async (req, res) => {
  const { patient_id, reason } = req.body;
  if (!patient_id) throw new ApiError(422, "patient_id_required", "Patient ID is required.");

  const pResult = await query(`SELECT * FROM patients WHERE id = $1 AND is_active = true;`, [patient_id]);
  const patient = pResult.rows[0];
  if (!patient) throw new ApiError(404, "patient_not_found", "Active patient not found.");

  // Check for open physician
  const physResult = await query(`SELECT id FROM physicians WHERE is_active = true ORDER BY full_name LIMIT 1;`);
  const physId = physResult.rows[0] ? physResult.rows[0].id : null;

  const visitResult = await query(
    `INSERT INTO visits (patient_id, physician_id, status, chief_complaint, visit_type, created_by_user_id)
     VALUES ($1, $2, 'open', $3, 'periodic_renewal', $4)
     RETURNING *;`,
    [patient.id, physId, reason || "Periodic 6-Month Medical Fitness Renewal Checkup", req.user.id]
  );

  await query(
    `UPDATE patients SET fitness_status = 'renewal_visit_created' WHERE id = $1;`,
    [patient.id]
  );

  await logAudit(req, {
    action: "create",
    module: "checkups",
    tableName: "visits",
    recordId: visitResult.rows[0].id,
    description: `Dispatched 6-month fitness renewal visit #${visitResult.rows[0].id} for ${patient.full_name} (${patient.patient_code})`,
    afterData: visitResult.rows[0],
  });

  res.status(201).json(visitResult.rows[0]);
}));

// POST /api/checkups/approve-renewal — HR approves completed renewal and resets 6-month timer
// Also creates a medical_certifications record for audit trail (Change B)
router.post("/checkups/approve-renewal", CHECKUP_WRITE, asyncHandler(async (req, res) => {
  const { patient_id, physician_id, result: examResult } = req.body;
  if (!patient_id) throw new ApiError(422, "patient_id_required", "Patient ID is required.");

  // Update patient fitness dates
  const patientResult = await query(
    `UPDATE patients 
     SET last_fitness_exam_date = CURRENT_DATE,
         next_checkup_due_date = (CURRENT_DATE + INTERVAL '6 months')::date,
         fitness_status = 'fit'
     WHERE id = $1 AND is_active = true
     RETURNING *;`,
    [patient_id]
  );

  if (!patientResult.rows[0]) throw new ApiError(404, "patient_not_found", "Active patient not found.");
  const patient = patientResult.rows[0];

  // Find a valid physician_id: use provided, or find from the renewal visit, or first active physician
  let certPhysId = physician_id || null;
  if (!certPhysId) {
    const visitRow = await query(
      `SELECT physician_id FROM visits WHERE patient_id = $1 AND visit_type = 'periodic_renewal' ORDER BY created_at DESC LIMIT 1;`,
      [patient_id]
    );
    certPhysId = visitRow.rows[0] ? visitRow.rows[0].physician_id : null;
  }
  if (!certPhysId) {
    const fallback = await query(`SELECT id FROM physicians WHERE is_active = true ORDER BY full_name LIMIT 1;`);
    certPhysId = fallback.rows[0] ? fallback.rows[0].id : null;
  }

  // Find the employee_registration for this patient (if exists)
  const regRow = await query(
    `SELECT source_employee_registration_id FROM patients WHERE id = $1;`,
    [patient_id]
  );
  const regId = regRow.rows[0] ? regRow.rows[0].source_employee_registration_id : null;

  // Create a certification record for the renewal (audit trail)
  if (regId && certPhysId) {
    await query(
      `INSERT INTO medical_certifications
         (employee_registration_id, physician_id, examination_date, result, certification_type, approved_by_hr,
          physical_examination, personal_hygiene, skin_disease, stool_exam_direct,
          syphilis, gonorrhea, other_findings, treatment_note, treatment_result_note)
       VALUES ($1, $2, now(), $3, 'periodic_renewal', true,
               'Renewal', 'Renewal', '', '', '', '', 'Periodic 6-month fitness renewal', '', '');`,
      [regId, certPhysId, examResult || "fit"]
    );
  }

  // Close the renewal visit if open
  await query(
    `UPDATE visits SET status = 'closed' WHERE patient_id = $1 AND visit_type = 'periodic_renewal' AND status = 'open';`,
    [patient_id]
  );

  await logAudit(req, {
    action: "update",
    module: "checkups",
    tableName: "patients",
    recordId: Number(patient_id),
    description: `Approved 6-month renewal for ${patient.full_name} (${patient.patient_code}). Next checkup due: ${patient.next_checkup_due_date}`,
    afterData: patient,
  });

  res.json(patient);
}));

// PUT /api/checkups/edit-exam-date — Manually set the fitness exam date for a patient (for paper records)
// Change A: allows manual entry of historical exam dates
router.put("/checkups/edit-exam-date", CHECKUP_WRITE, asyncHandler(async (req, res) => {
  const { patient_id, last_fitness_exam_date } = req.body;
  if (!patient_id) throw new ApiError(422, "patient_id_required", "Patient ID is required.");
  if (!last_fitness_exam_date) throw new ApiError(422, "date_required", "Fitness exam date is required.");

  const examDate = new Date(last_fitness_exam_date);
  if (isNaN(examDate.getTime())) throw new ApiError(422, "invalid_date", "Invalid date format.");

  // Calculate next checkup due date: exam date + 6 months
  const result = await query(
    `UPDATE patients 
     SET last_fitness_exam_date = $2::date,
         next_checkup_due_date = ($2::date + INTERVAL '6 months')::date,
         fitness_status = 'fit'
     WHERE id = $1 AND is_active = true
     RETURNING *;`,
    [patient_id, last_fitness_exam_date]
  );

  if (!result.rows[0]) throw new ApiError(404, "patient_not_found", "Active patient not found.");

  await logAudit(req, {
    action: "update",
    module: "checkups",
    tableName: "patients",
    recordId: Number(patient_id),
    description: `Manually set fitness exam date to ${last_fitness_exam_date} for ${result.rows[0].full_name} (${result.rows[0].patient_code})`,
    afterData: result.rows[0],
  });

  res.json(result.rows[0]);
}));

module.exports = router;
