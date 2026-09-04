const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

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

router.get("/visits", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist", "department_hr"), asyncHandler(async (req, res) => {
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

router.get("/visits/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist"), asyncHandler(async (req, res) => {
  const result = await query(`SELECT * FROM visits WHERE id = $1;`, [req.params.id]);
  const visit = result.rows[0];
  if (!visit) throw new ApiError(404, "visit_not_found", "Visit not found.");
  res.json(await embedVisit(visit));
}));

router.post("/visits", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist", "department_hr"), asyncHandler(async (req, res) => {
  const { patient_id, physician_id, chief_complaint } = req.body;
  if (!patient_id) {
    throw new ApiError(422, "patient_required", "Patient is required.");
  }

  let physId = physician_id;
  if (!physId) {
    const physResult = await query(`SELECT id FROM physicians WHERE is_active = true ORDER BY full_name LIMIT 1;`);
    physId = physResult.rows[0] ? physResult.rows[0].id : null;
  }

  const result = await query(
    `INSERT INTO visits (patient_id, physician_id, status, chief_complaint, examination_notes, created_by_user_id)
     VALUES ($1, $2, 'open', $3, '', $4)
     RETURNING *;`,
    [patient_id, physId, chief_complaint || "Checkup Dispatch", req.user.id]
  );
  const newVisit = result.rows[0];

  const patRes = await query(`SELECT full_name, patient_code FROM patients WHERE id = $1;`, [patient_id]);
  const patName = patRes.rows[0]?.full_name || `Patient #${patient_id}`;

  await logAudit(req, {
    action: "create",
    module: "visits",
    tableName: "visits",
    recordId: newVisit.id,
    description: `Created visit #${newVisit.id} for '${patName}' (Reason: ${newVisit.chief_complaint || "Routine"})`,
    afterData: newVisit,
  });

  res.status(201).json(newVisit);
}));

router.put("/visits/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist"), asyncHandler(async (req, res) => {
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
    if (req.body.status === "closed") {
      if (next.disposition === "admitted") {
        const admission = await query(`SELECT id FROM admissions WHERE visit_id = $1;`, [req.params.id]);
        if (!admission.rows[0]) {
          throw new ApiError(
            422,
            "admission_required",
            'Disposition is "admitted" but no admission record exists for this visit yet.'
          );
        }
      }
      const pendingLab = await query(
        `SELECT id FROM lab_orders WHERE visit_id = $1 AND status IN ('pending', 'in_progress');`,
        [req.params.id]
      );
      if (pendingLab.rows[0]) {
        throw new ApiError(422, "lab_orders_pending", "This visit has lab orders still pending or in progress.");
      }
    }
  }

  const editable = ["physician_id", "status", "chief_complaint", "examination_notes", "diagnosis", "treatment", "disposition", "hr_note"];
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

  if (req.body.physician_id && String(req.body.physician_id) !== String(current.physician_id)) {
    await query(`UPDATE lab_orders SET physician_id = $1 WHERE visit_id = $2;`, [req.body.physician_id, req.params.id]);
    await query(`UPDATE prescriptions SET physician_id = $1 WHERE visit_id = $2;`, [req.body.physician_id, req.params.id]);
    await query(`UPDATE referrals SET physician_id = $1 WHERE visit_id = $2;`, [req.body.physician_id, req.params.id]);
    await query(`UPDATE sick_leaves SET physician_id = $1 WHERE visit_id = $2;`, [req.body.physician_id, req.params.id]);
  }

  const updatedVisit = result.rows[0];
  await logAudit(req, {
    action: "update",
    module: "visits",
    tableName: "visits",
    recordId: updatedVisit.id,
    description: `Updated visit #${updatedVisit.id} (Status: ${updatedVisit.status}${updatedVisit.diagnosis ? ', Diagnosis: ' + updatedVisit.diagnosis : ''})`,
    beforeData: current,
    afterData: updatedVisit,
  });

  res.json(await embedVisit(updatedVisit));
}));

router.delete("/visits/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin", "lab_technician", "pharmacist", "department_hr"), asyncHandler(async (req, res) => {
  const visitId = req.params.id;
  const existing = await query(`SELECT * FROM visits WHERE id = $1;`, [visitId]);
  const visit = existing.rows[0];
  if (!visit) throw new ApiError(404, "visit_not_found", "Visit not found.");

  await query(`DELETE FROM visits WHERE id = $1;`, [visitId]);

  await logAudit(req, {
    action: "delete",
    module: "visits",
    tableName: "visits",
    recordId: visitId,
    description: `Deleted visit #${visitId}`,
    beforeData: visit,
  });

  res.json({ success: true, id: visitId });
}));

module.exports = router;

