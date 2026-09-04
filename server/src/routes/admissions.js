const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const router = express.Router();
router.use(requireAuth);

async function embedAdmission(row) {
  const notes = await query(
    `SELECT * FROM admission_notes WHERE admission_id = $1 ORDER BY recorded_at DESC;`,
    [row.id]
  );
  return { ...row, notes: notes.rows };
}

router.get("/admissions", requireRole("physician", "system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  const { search, status, visit_id } = req.query;
  const conditions = [];
  const params = [];

  if (visit_id) {
    params.push(visit_id);
    conditions.push(`a.visit_id = $${params.length}`);
  }
  if (status && status !== "all") {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT a.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM admissions a
     JOIN patients p ON p.id = a.patient_id
     ${where}
     ORDER BY a.admitted_at DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/admissions/:id", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT a.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM admissions a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "admission_not_found", "Admission not found.");
  res.json(await embedAdmission(result.rows[0]));
}));

router.post("/admissions", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { visit_id, admitting_physician_id, reason } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");

  const visitResult = await query(`SELECT * FROM visits WHERE id = $1;`, [visit_id]);
  const visit = visitResult.rows[0];
  if (!visit) throw new ApiError(422, "invalid_visit", "Select a valid visit.");
  if (visit.disposition !== "admitted") {
    throw new ApiError(422, "visit_not_admitted", "This visit's disposition is not \"admitted\".");
  }

  const existing = await query(`SELECT id FROM admissions WHERE visit_id = $1;`, [visit_id]);
  if (existing.rows[0]) {
    throw new ApiError(422, "admission_already_exists", "An admission record already exists for this visit.");
  }

  const result = await query(
    `INSERT INTO admissions (visit_id, patient_id, admitting_physician_id, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [visit_id, visit.patient_id, admitting_physician_id || null, reason || ""]
  );

  const admission = result.rows[0];

  await logAudit(req, {
    action: "create",
    module: "admissions",
    tableName: "admissions",
    recordId: admission.id,
    description: `Admitted patient #${visit.patient_id} (Admission #${admission.id}, Visit #${visit_id})`,
    afterData: admission,
  });

  res.status(201).json(admission);
}));

router.post("/admissions/:id/notes", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { note } = req.body;
  if (!note || !note.trim()) throw new ApiError(422, "note_required", "Note text is required.");

  const admissionResult = await query(`SELECT id FROM admissions WHERE id = $1;`, [req.params.id]);
  if (!admissionResult.rows[0]) throw new ApiError(404, "admission_not_found", "Admission not found.");

  const result = await query(
    `INSERT INTO admission_notes (admission_id, note, recorded_by)
     VALUES ($1, $2, $3)
     RETURNING *;`,
    [req.params.id, note.trim(), req.user ? req.user.id : null]
  );

  await logAudit(req, {
    action: "update",
    module: "admissions",
    tableName: "admission_notes",
    recordId: Number(req.params.id),
    description: `Added clinical progress note to Admission #${req.params.id}`,
    afterData: result.rows[0],
  });

  res.status(201).json(result.rows[0]);
}));

router.post("/admissions/:id/discharge", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const current = await query(`SELECT * FROM admissions WHERE id = $1;`, [req.params.id]);
  const admission = current.rows[0];
  if (!admission) throw new ApiError(404, "admission_not_found", "Admission not found.");
  if (admission.status === "discharged") {
    throw new ApiError(422, "already_discharged", "This admission has already been discharged.");
  }

  const result = await query(
    `UPDATE admissions
     SET status = 'discharged', discharged_at = now(), discharge_notes = $1
     WHERE id = $2
     RETURNING *;`,
    [req.body.discharge_notes || "", req.params.id]
  );

  await logAudit(req, {
    action: "update",
    module: "admissions",
    tableName: "admissions",
    recordId: Number(req.params.id),
    description: `Discharged patient for Admission #${req.params.id}`,
    beforeData: admission,
    afterData: result.rows[0],
  });

  res.json(result.rows[0]);
}));

module.exports = router;
