const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

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
    `SELECT p.*, COALESCE(p.department, er.department) AS department, COALESCE(p.position, er.position) AS position
     FROM patients p
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     ${where}
     ORDER BY p.registered_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/patients/:id", CLINICAL_READ, asyncHandler(async (req, res) => {
  const patientResult = await query(
    `SELECT p.*, COALESCE(p.department, er.department) AS department, COALESCE(p.position, er.position) AS position
     FROM patients p
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     WHERE p.id = $1;`,
    [req.params.id]
  );
  const patient = patientResult.rows[0];
  if (!patient) throw new ApiError(404, "patient_not_found", "Patient not found.");

  const visitsResult = await query(
    `SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date DESC;`,
    [req.params.id]
  );

  res.json({ ...patient, visits: visitsResult.rows });
}));

router.post("/patients", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const { full_name, date_of_birth, gender, location, address, phone, photo_url, department, position } = req.body;
  if (!full_name || !full_name.trim()) {
    throw new ApiError(422, "full_name_required", "Full name is required.");
  }

  const result = await query(
    `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url, department, position)
     VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
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
    ]
  );
  res.status(201).json(result.rows[0]);
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

  params.push(req.params.id);
  const result = await query(
    `UPDATE patients SET ${updates.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *;`,
    params
  );
  if (!result.rows[0]) throw new ApiError(404, "patient_not_found", "Patient not found.");
  res.json(result.rows[0]);
}));

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
  const VALID_DEPARTMENTS = [
    "Medical", "Finance", "Human Resource Management",
    "Planning and Budget Service", "Product Quality Control Service",
    "Production and Technic", "Property Management"
  ];

  // Validate a single row; returns an error string or null.
  function validateRow(row) {
    for (const field of REQUIRED_FIELDS) {
      const val = (row[field] || "").toString().trim();
      if (!val) return `Missing required field: "${field}"`;
    }
    if (row.department && !VALID_DEPARTMENTS.includes(row.department.trim())) {
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

  const INSERT_SQL = `
    INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url, department, position)
    VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;`;

  const rowParams = (row) => [
    row.full_name.trim(),
    row.date_of_birth || null,
    (row.gender || "").toLowerCase() || null,
    row.location || "",
    row.address || "",
    row.phone || "",
    row.photo_url || null,
    row.department ? row.department.trim() : null,
    row.position ? row.position.trim() : null,
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
        const r = await client.query(INSERT_SQL, rowParams(row));
        results.push(r.rows[0]);
      }
      return results;
    });

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
      const result = await query(INSERT_SQL, rowParams(row));
      committed.push(result.rows[0]);
    } catch (dbErr) {
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

  return res.status(201).json({
    success: true,
    mode: "partial",
    successCount: committed.length,
    records: committed,
  });
}));

router.delete("/patients/:id", requireRole("system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM patients WHERE id = $1 RETURNING id;`, [req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "patient_not_found", "Patient not found.");
  res.json({ success: true, id: result.rows[0].id });
}));

module.exports = router;
