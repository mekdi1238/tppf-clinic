const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const router = express.Router();
router.use(requireAuth);

const CERTIFIABLE_STATUSES = ["pending", "certified_fit", "certified_unfit", "accepted_as_staff", "hired"];

router.get("/certifications", requireRole("physician", "system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  const { search, result } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(COALESCE(p.full_name, r.full_name, '')) LIKE $${params.length} OR lower(COALESCE(p.patient_code, r.registration_code, '')) LIKE $${params.length} OR lower(COALESCE(p.position, r.occupation, '')) LIKE $${params.length})`
    );
  }
  if (result && result !== 'all') {
    params.push(result);
    conditions.push(`c.result = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query(
    `SELECT c.*,
            row_to_json(r.*) AS registration,
            row_to_json(p.*) AS patient,
            row_to_json(ph.*) AS physician,
            COALESCE(p.full_name, r.full_name) AS target_name,
            COALESCE(p.patient_code, r.registration_code) AS target_code,
            COALESCE(p.department, r.department) AS target_department,
            COALESCE(p.position, r.occupation) AS target_position
     FROM medical_certifications c
     LEFT JOIN employee_registrations r ON r.id = c.employee_registration_id
     LEFT JOIN patients p ON p.id = c.patient_id
     LEFT JOIN physicians ph ON ph.id = c.physician_id
     ${where}
     ORDER BY c.examination_date DESC, c.id DESC;`,
    params
  );
  res.json(rows.rows);
}));

router.get("/certifications/:id", requireRole("physician", "system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.*,
            row_to_json(r.*) AS registration,
            row_to_json(p.*) AS patient,
            row_to_json(ph.*) AS physician,
            COALESCE(p.full_name, r.full_name) AS target_name,
            COALESCE(p.patient_code, r.registration_code) AS target_code,
            COALESCE(p.department, r.department) AS target_department,
            COALESCE(p.position, r.occupation) AS target_position
     FROM medical_certifications c
     LEFT JOIN employee_registrations r ON r.id = c.employee_registration_id
     LEFT JOIN patients p ON p.id = c.patient_id
     LEFT JOIN physicians ph ON ph.id = c.physician_id
     WHERE c.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "certification_not_found", "Certification not found.");
  res.json(result.rows[0]);
}));

router.post("/certifications", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  let {
    employee_registration_id, patient_id, physician_id, result, examination_date,
    physical_examination, personal_hygiene, skin_disease, stool_exam_direct,
    syphilis, gonorrhea, other_findings, treatment_note, treatment_result_note,
  } = req.body;

  let resolvedPatientId = patient_id ? Number(patient_id) : null;
  let resolvedRegId = employee_registration_id ? Number(employee_registration_id) : null;

  if (resolvedPatientId) {
    const pRes = await query(`SELECT * FROM patients WHERE id = $1;`, [resolvedPatientId]);
    const patient = pRes.rows[0];
    if (!patient) throw new ApiError(422, "invalid_patient", "Select a valid patient.");
    if (patient.source_employee_registration_id) {
      resolvedRegId = patient.source_employee_registration_id;
    }
  } else if (resolvedRegId) {
    const regRes = await query(`SELECT * FROM employee_registrations WHERE id = $1;`, [resolvedRegId]);
    const reg = regRes.rows[0];
    if (!reg) throw new ApiError(422, "invalid_registration", "Select a valid candidate or patient.");
    const pRes = await query(`SELECT id FROM patients WHERE source_employee_registration_id = $1 LIMIT 1;`, [resolvedRegId]);
    if (pRes.rows[0]) {
      resolvedPatientId = pRes.rows[0].id;
    }
  } else {
    throw new ApiError(422, "target_required", "Select a candidate or patient for the certificate.");
  }

  if (!physician_id) throw new ApiError(422, "physician_required", "Select the examining physician.");
  if (!result || (result !== "fit" && result !== "unfit")) {
    throw new ApiError(422, "result_required", "Specify an exam result of 'fit' or 'unfit'.");
  }

  const examDate = examination_date ? new Date(examination_date) : new Date();
  if (isNaN(examDate.getTime())) throw new ApiError(422, "invalid_date", "Invalid examination date.");

  // Insert certificate record
  const certResult = await query(
    `INSERT INTO medical_certifications
       (employee_registration_id, patient_id, physician_id, examination_date, result,
        physical_examination, personal_hygiene, skin_disease, stool_exam_direct,
        syphilis, gonorrhea, other_findings, treatment_note, treatment_result_note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *;`,
    [
      resolvedRegId,
      resolvedPatientId,
      physician_id,
      examDate,
      result,
      physical_examination || "",
      personal_hygiene || "",
      skin_disease || "",
      stool_exam_direct || "",
      syphilis || "",
      gonorrhea || "",
      other_findings || "",
      treatment_note || "",
      treatment_result_note || "",
    ]
  );

  const cert = certResult.rows[0];

  // If candidate registration exists and not yet accepted as staff, update its status
  if (resolvedRegId) {
    const regRes = await query(`SELECT status FROM employee_registrations WHERE id = $1;`, [resolvedRegId]);
    const currentRegStatus = regRes.rows[0]?.status;
    if (currentRegStatus !== "accepted_as_staff" && currentRegStatus !== "hired") {
      const newStatus = result === "fit" ? "certified_fit" : "certified_unfit";
      await query(`UPDATE employee_registrations SET status = $1 WHERE id = $2;`, [newStatus, resolvedRegId]);
    }
  }

  // If patient exists, automatically update 6-month checkup dates & fitness_status
  if (resolvedPatientId || resolvedRegId) {
    if (result === "fit") {
      await query(
        `UPDATE patients
         SET fitness_status = 'fit',
             last_fitness_exam_date = $1::date,
             next_checkup_due_date = ($1::date + INTERVAL '6 months')::date
         WHERE id = $2 OR (source_employee_registration_id IS NOT NULL AND source_employee_registration_id = $3);`,
        [examDate, resolvedPatientId, resolvedRegId]
      );
    } else {
      await query(
        `UPDATE patients
         SET fitness_status = 'unfit',
             last_fitness_exam_date = $1::date
         WHERE id = $2 OR (source_employee_registration_id IS NOT NULL AND source_employee_registration_id = $3);`,
        [examDate, resolvedPatientId, resolvedRegId]
      );
    }
  }

  // Close any open certification visits for this patient
  if (resolvedPatientId) {
    await query(
      `UPDATE visits SET status = 'closed'
       WHERE patient_id = $1 AND status != 'closed' AND visit_type IN ('periodic_renewal', 'certification');`,
      [resolvedPatientId]
    );
  }

  await logAudit(req, {
    action: "create",
    module: "certifications",
    tableName: "medical_certifications",
    recordId: cert.id,
    description: `Issued medical fitness certificate #${cert.id} with result '${result.toUpperCase()}'`,
    afterData: cert,
  });

  res.status(201).json(cert);
}));

router.put("/certifications/:id", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const certId = req.params.id;
  const {
    examination_date, result, physician_id,
    physical_examination, personal_hygiene, skin_disease, stool_exam_direct,
    syphilis, gonorrhea, other_findings, treatment_note, treatment_result_note,
  } = req.body;

  // Verify certification exists
  const existing = await query(`SELECT * FROM medical_certifications WHERE id = $1;`, [certId]);
  if (!existing.rows[0]) throw new ApiError(404, "certification_not_found", "Certification not found.");

  if (result && result !== "fit" && result !== "unfit") {
    throw new ApiError(422, "invalid_result", "Exam result must be 'fit' or 'unfit'.");
  }

  // Build dynamic SET clause for provided fields
  const updates = [];
  const params = [];
  let paramIdx = 0;

  const addField = (column, value) => {
    if (value !== undefined) {
      paramIdx++;
      updates.push(`${column} = $${paramIdx}`);
      params.push(value);
    }
  };

  addField("examination_date", examination_date);
  addField("result", result);
  addField("physician_id", physician_id);
  addField("physical_examination", physical_examination);
  addField("personal_hygiene", personal_hygiene);
  addField("skin_disease", skin_disease);
  addField("stool_exam_direct", stool_exam_direct);
  addField("syphilis", syphilis);
  addField("gonorrhea", gonorrhea);
  addField("other_findings", other_findings);
  addField("treatment_note", treatment_note);
  addField("treatment_result_note", treatment_result_note);

  if (!updates.length) throw new ApiError(422, "no_fields", "No fields to update.");

  paramIdx++;
  params.push(certId);
  const certResult = await query(
    `UPDATE medical_certifications SET ${updates.join(", ")} WHERE id = $${paramIdx} RETURNING *;`,
    params
  );

  const cert = certResult.rows[0];

  // If examination_date was changed, update the patient's fitness dates too
  if (examination_date) {
    const patRow = await query(
      `SELECT id FROM patients WHERE source_employee_registration_id = $1;`,
      [cert.employee_registration_id]
    );
    if (patRow.rows[0]) {
      await query(
        `UPDATE patients
         SET last_fitness_exam_date = $1::date,
             next_checkup_due_date = ($1::date + INTERVAL '6 months')::date
         WHERE id = $2;`,
        [examination_date, patRow.rows[0].id]
      );
    }
  }

  // If result was changed, update registration status too
  if (result) {
    const newStatus = result === "fit" ? "certified_fit" : "certified_unfit";
    await query(
      `UPDATE employee_registrations SET status = $1 WHERE id = $2;`,
      [newStatus, cert.employee_registration_id]
    );
  }

  await logAudit(req, {
    action: "update",
    module: "certifications",
    tableName: "medical_certifications",
    recordId: Number(certId),
    description: `Updated medical certificate #${certId}`,
    beforeData: existing.rows[0],
    afterData: cert,
  });

  res.json(cert);
}));

module.exports = router;
