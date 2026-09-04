const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const CLINICAL_READ = requireRole("receptionist", "physician", "lab_technician", "pharmacist", "system_administrator", "hr_admin", "department_hr");
const CLINICAL_WRITE = requireRole("receptionist", "physician", "system_administrator", "hr_admin");

const router = express.Router();
router.use(requireAuth);

router.get("/patients", CLINICAL_READ, asyncHandler(async (req, res) => {
  const { search, status, department } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length} OR p.phone LIKE $${params.length})`
    );
  }
  if (status === "active") conditions.push("p.is_active = true");
  if (status === "inactive") conditions.push("p.is_active = false");
  if (department && department !== "all") {
    params.push(department);
    conditions.push(`COALESCE(p.department, er.department) = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT p.*,
            COALESCE(p.department, er.department) AS department,
            COALESCE(p.position, er.position) AS position,
            cert.id AS latest_certificate_id,
            cert.examination_date AS certificate_exam_date,
            cert.result AS certificate_result,
            cert.certification_type AS certificate_type,
            CASE
              WHEN cert.id IS NULL AND p.last_fitness_exam_date IS NULL THEN 'no_certificate'
              WHEN p.next_checkup_due_date < CURRENT_DATE THEN 'expired'
              WHEN p.next_checkup_due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
              ELSE 'certified_fit'
            END AS certificate_status
     FROM patients p
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     LEFT JOIN LATERAL (
       SELECT c.id, c.examination_date, c.result, c.certification_type
       FROM medical_certifications c
       WHERE c.patient_id = p.id OR (p.source_employee_registration_id IS NOT NULL AND c.employee_registration_id = p.source_employee_registration_id)
       ORDER BY c.examination_date DESC, c.id DESC
       LIMIT 1
     ) cert ON true
     ${where}
     ORDER BY p.registered_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/patients/:id", CLINICAL_READ, asyncHandler(async (req, res) => {
  const patientResult = await query(
    `SELECT p.*,
            COALESCE(p.department, er.department) AS department,
            COALESCE(p.position, er.position) AS position,
            cert.id AS latest_certificate_id,
            cert.examination_date AS certificate_exam_date,
            cert.result AS certificate_result,
            cert.certification_type AS certificate_type,
            CASE
              WHEN cert.id IS NULL AND p.last_fitness_exam_date IS NULL THEN 'no_certificate'
              WHEN p.next_checkup_due_date < CURRENT_DATE THEN 'expired'
              WHEN p.next_checkup_due_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'due_soon'
              ELSE 'certified_fit'
            END AS certificate_status
     FROM patients p
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     LEFT JOIN LATERAL (
       SELECT c.id, c.examination_date, c.result, c.certification_type
       FROM medical_certifications c
       WHERE c.patient_id = p.id OR (p.source_employee_registration_id IS NOT NULL AND c.employee_registration_id = p.source_employee_registration_id)
       ORDER BY c.examination_date DESC, c.id DESC
       LIMIT 1
     ) cert ON true
     WHERE p.id = $1;`,
    [req.params.id]
  );
  const patient = patientResult.rows[0];
  if (!patient) throw new ApiError(404, "patient_not_found", "Patient not found.");

  const visitsResult = await query(
    `SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date DESC;`,
    [req.params.id]
  );

  const certsResult = await query(
    `SELECT c.*, ph.full_name AS physician_name
     FROM medical_certifications c
     LEFT JOIN physicians ph ON ph.id = c.physician_id
     WHERE c.patient_id = $1 OR (c.employee_registration_id IS NOT NULL AND c.employee_registration_id = $2)
     ORDER BY c.examination_date DESC;`,
    [patient.id, patient.source_employee_registration_id]
  );

  res.json({ ...patient, visits: visitsResult.rows, certifications: certsResult.rows });
}));

const { syncPhysicians } = require("../services/physicianSync");

router.post("/patients", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const { full_name, date_of_birth, gender, location, address, phone, photo_url, department, position } = req.body;
  if (!full_name || !full_name.trim()) {
    throw new ApiError(422, "full_name_required", "Full name is required.");
  }

  const regResult = await query(
    `INSERT INTO employee_registrations (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position)
     VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, 'accepted_as_staff', $7, $8)
     RETURNING id;`,
    [
      full_name.trim(),
      date_of_birth || null,
      gender || null,
      location || "",
      position ? position.trim() : "Staff",
      photo_url || null,
      department ? department.trim() : "General",
      position ? position.trim() : "Staff",
    ]
  );
  const regId = regResult.rows[0].id;

  const result = await query(
    `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url, department, position, source_employee_registration_id)
     VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *;`,
    [
      full_name.trim(),
      date_of_birth || null,
      gender || null,
      location || "",
      address || "",
      phone || "",
      photo_url || null,
      department ? department.trim() : null,
      position ? position.trim() : null,
      regId,
    ]
  );
  await syncPhysicians();

  const newPatient = result.rows[0];
  await logAudit(req, {
    action: "create",
    module: "patients",
    tableName: "patients",
    recordId: newPatient.id,
    description: `Created patient record for '${newPatient.full_name}' (${newPatient.patient_code})`,
    afterData: newPatient,
  });

  res.status(201).json(newPatient);
}));

router.put("/patients/:id", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const editable = ["full_name", "date_of_birth", "gender", "location", "address", "phone", "photo_url", "is_active", "department", "position"];
  const updates = [];
  const params = [];

  for (const key of editable) {
    if (req.body[key] !== undefined) {
      let val = req.body[key];
      if (typeof val === "string") val = val.trim() || null;
      params.push(val);
      updates.push(`${key} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    const existing = await query(
      `SELECT p.*, COALESCE(p.department, er.department) AS department, COALESCE(p.position, er.position) AS position
       FROM patients p
       LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
       WHERE p.id = $1;`,
      [req.params.id]
    );
    if (!existing.rows[0]) throw new ApiError(404, "patient_not_found", "Patient not found.");
    return res.json(existing.rows[0]);
  }

  const existingRes = await query(`SELECT * FROM patients WHERE id = $1;`, [req.params.id]);
  const beforePatient = existingRes.rows[0];
  if (!beforePatient) throw new ApiError(404, "patient_not_found", "Patient not found.");

  params.push(req.params.id);
  const result = await query(
    `UPDATE patients SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *;`,
    params
  );
  if (!result.rows[0]) throw new ApiError(404, "patient_not_found", "Patient not found.");
  await syncPhysicians();

  const updatedPatient = result.rows[0];
  await logAudit(req, {
    action: "update",
    module: "patients",
    tableName: "patients",
    recordId: updatedPatient.id,
    description: `Updated patient details for '${updatedPatient.full_name}' (${updatedPatient.patient_code})`,
    beforeData: beforePatient,
    afterData: updatedPatient,
  });

  res.json(updatedPatient);
}));

const { resolveDepartment } = require("../utils/departmentSorter");

// POST /patients/import
// Bulk-import walk-in patients from an array of row objects.
// Supports two modes:
//   atomic=true  → All-or-nothing: if any row fails, ROLLBACK and save nothing.
//   atomic=false → Stop-on-error: commit rows 1…K-1, stop at row K, report error & remaining rows.
router.post("/patients/import", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const { records, atomic = false } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(422, "import_records_required", "records must be a non-empty array.");
  }

  const REQUIRED_FIELDS = ["full_name"];
  const deptsRes = await query(`SELECT name FROM departments;`);
  const VALID_DEPARTMENTS = deptsRes.rows.map(r => r.name);

  // Validate a single row; returns an error string or null.
  function validateRow(row) {
    for (const field of REQUIRED_FIELDS) {
      const val = (row[field] || "").toString().trim();
      if (!val) return `Missing required field: "${field}"`;
    }
    if (row.department && !VALID_DEPARTMENTS.some(d => d.toLowerCase() === row.department.trim().toLowerCase())) {
      return `Invalid department "${row.department}". Must be one of: ${VALID_DEPARTMENTS.join(", ")}.`;
    }
    if (row.date_of_birth && isNaN(Date.parse(row.date_of_birth))) {
      return `Invalid date_of_birth "${row.date_of_birth}". Use YYYY-MM-DD format.`;
    }
    if (row.gender && !["male", "female"].includes(row.gender.toString().toLowerCase())) {
      return `Invalid gender "${row.gender}". Must be "male" or "female".`;
    }
    return null;
  }

  const REG_INSERT_SQL = `
    INSERT INTO employee_registrations (
      registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position
    ) VALUES (
      'R' || lpad(nextval('registration_code_seq')::text, 3, '0'),
      $1, $2, $3, $4, $5, $6, 'accepted_as_staff', $7, $8
    ) RETURNING id;`;

  const regParams = (row) => [
    row.full_name.trim(),
    row.date_of_birth || null,
    (row.gender || "").toLowerCase() || null,
    row.location || "",
    row.position ? row.position.trim() : "Staff",
    row.photo_url || null,
    resolveDepartment(row.department ? row.department.trim() : "General", row.position),
    row.position ? row.position.trim() : "Staff",
  ];

  const PAT_INSERT_SQL = `
    INSERT INTO patients (
      patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url, department, position, source_employee_registration_id
    ) VALUES (
      'S' || lpad(nextval('patient_code_seq')::text, 3, '0'),
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
    ) RETURNING *;`;

  const patParams = (row, regId) => [
    row.full_name.trim(),
    row.date_of_birth || null,
    (row.gender || "").toLowerCase() || null,
    row.location || "",
    row.address || "",
    row.phone || "",
    row.photo_url || null,
    row.department ? row.department.trim() : null,
    row.position ? row.position.trim() : null,
    regId,
  ];

  // ---------- ATOMIC MODE ----------
  if (atomic) {
    for (let i = 0; i < records.length; i++) {
      const err = validateRow(records[i]);
      if (err) {
        return res.status(422).json({
          success: false,
          mode: "atomic",
          successCount: 0,
          failedRowIndex: i + 1,
          failedRow: records[i],
          error: err,
          remainingRows: records.slice(i),
        });
      }
    }

    const inserted = await withTransaction(async (client) => {
      const results = [];
      for (const row of records) {
        const regRes = await client.query(REG_INSERT_SQL, regParams(row));
        const regId = regRes.rows[0].id;
        const patRes = await client.query(PAT_INSERT_SQL, patParams(row, regId));
        results.push(patRes.rows[0]);
      }
      return results;
    });

    await syncPhysicians();

    return res.status(201).json({
      success: true,
      mode: "atomic",
      successCount: inserted.length,
      records: inserted,
    });
  }

  // ---------- PARTIAL MODE ----------
  const committed = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i];
    const err = validateRow(row);
    if (err) {
      if (committed.length > 0) await syncPhysicians();
      return res.status(207).json({
        success: false,
        mode: "partial",
        successCount: committed.length,
        failedRowIndex: i + 1,
        failedRow: row,
        error: err,
        remainingRows: records.slice(i),
      });
    }
    try {
      const regRes = await query(REG_INSERT_SQL, regParams(row));
      const regId = regRes.rows[0].id;
      const patRes = await query(PAT_INSERT_SQL, patParams(row, regId));
      committed.push(patRes.rows[0]);
    } catch (dbErr) {
      if (committed.length > 0) await syncPhysicians();
      return res.status(207).json({
        success: false,
        mode: "partial",
        successCount: committed.length,
        failedRowIndex: i + 1,
        failedRow: row,
        error: `Database error: ${dbErr.message}`,
        remainingRows: records.slice(i),
      });
    }
  }

  await syncPhysicians();

  return res.status(201).json({
    success: true,
    mode: "partial",
    successCount: committed.length,
    records: committed,
  });
}));

router.post("/patients/:id/ensure-registration", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const patRes = await query(`SELECT * FROM patients WHERE id = $1;`, [req.params.id]);
  const patient = patRes.rows[0];
  if (!patient) throw new ApiError(404, "patient_not_found", "Patient not found.");

  if (patient.source_employee_registration_id) {
    return res.json({ registration_id: patient.source_employee_registration_id });
  }

  const regRes = await query(
    `INSERT INTO employee_registrations (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position)
     VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, 'accepted_as_staff', $7, $8)
     RETURNING id;`,
    [
      patient.full_name,
      patient.date_of_birth || null,
      patient.gender || null,
      patient.location || "",
      patient.position || "Staff",
      patient.photo_url || null,
      patient.department || "General",
      patient.position || "Staff",
    ]
  );
  const regId = regRes.rows[0].id;
  await query(`UPDATE patients SET source_employee_registration_id = $1 WHERE id = $2;`, [regId, patient.id]);

  res.json({ registration_id: regId });
}));

router.delete("/patients/:id", requireRole("system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const existing = await query(`SELECT * FROM patients WHERE id = $1;`, [req.params.id]);
  const patient = existing.rows[0];
  if (!patient) throw new ApiError(404, "patient_not_found", "Patient not found.");

  const result = await query(`DELETE FROM patients WHERE id = $1 RETURNING id;`, [req.params.id]);
  
  await logAudit(req, {
    action: "delete",
    module: "patients",
    tableName: "patients",
    recordId: patient.id,
    description: `Deleted patient '${patient.full_name}' (${patient.patient_code})`,
    beforeData: patient,
  });

  res.json({ success: true, id: result.rows[0].id });
}));

module.exports = router;
