const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

const VISIT_STATUS_TRANSITIONS = {
  open: ["examined"],
  examined: ["diagnosed"],
  diagnosed: ["closed"],
  closed: [],
};

async function embedVisit(row) {
  const [patientResult, physicianResult] = await Promise.all([
    query(`SELECT * FROM patients WHERE id = $1;`, [row.patient_id]),
    query(`SELECT * FROM physicians WHERE id = $1;`, [row.physician_id]),
  ]);
  return {
    ...row,
    patient: patientResult.rows[0] || null,
    physician: physicianResult.rows[0] || null,
  };
}

router.get("/visits", asyncHandler(async (req, res) => {
  const { status, search } = req.query;
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`v.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length} OR lower(v.chief_complaint) LIKE $${params.length})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT v.*,
            row_to_json(p.*) AS patient,
            row_to_json(ph.*) AS physician
     FROM visits v
     JOIN patients p ON p.id = v.patient_id
     JOIN physicians ph ON ph.id = v.physician_id
     ${where}
     ORDER BY v.visit_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/visits/:id", asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM visits WHERE id = $1;`, [req.params.id]);
  const visit = result.rows[0];
  if (!visit) throw new ApiError(404, "visit_not_found", "Visit not found.");
  res.json(await embedVisit(visit));
}));

router.post("/visits", asyncHandler(async (req, res) => {
  const { patient_id, physician_id, chief_complaint } = req.body;
  if (!patient_id || !physician_id) {
    throw new ApiError(422, "patient_and_physician_required", "Patient and physician are required.");
  }

  const result = await query(
    `INSERT INTO visits (patient_id, physician_id, status, chief_complaint, examination_notes)
     VALUES ($1, $2, 'open', $3, '')
     RETURNING *;`,
    [patient_id, physician_id, chief_complaint || ""]
  );
  res.status(201).json(result.rows[0]);
}));

router.put("/visits/:id", asyncHandler(async (req, res) => {
  const currentResult = await query(`SELECT * FROM visits WHERE id = $1;`, [req.params.id]);
  const current = currentResult.rows[0];
  if (!current) throw new ApiError(404, "visit_not_found", "Visit not found.");

  const next = { ...current, ...req.body };

  if (req.body.status && req.body.status !== current.status) {
    const allowed = VISIT_STATUS_TRANSITIONS[current.status] || [];
    if (!allowed.includes(req.body.status)) {
      throw new ApiError(
        422,
        "invalid_visit_transition",
        `Cannot move a visit from "${current.status}" to "${req.body.status}" directly.`
      );
    }
    if (req.body.status === "closed" && next.disposition === "admitted") {
      throw new ApiError(
        422,
        "admissions_module_unavailable",
        'This visit is marked "admitted" but the Admissions module isn\'t built yet, so no admission record can exist. Closing is blocked until that module is available.'
      );
    }
  }

  const editable = ["status", "chief_complaint", "examination_notes", "diagnosis", "disposition"];
  const updates = [];
  const params = [];
  for (const key of editable) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    return res.json(current);
  }

  params.push(req.params.id);
  const result = await query(
    `UPDATE visits SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *;`,
    params
  );
  res.json(result.rows[0]);
}));

module.exports = router;
