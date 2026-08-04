const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

// Only hr_admin and physician can accept a candidate as staff
const ACCEPT_AS_STAFF_ROLES = requireRole("hr_admin", "physician", "system_administrator");

router.get("/registrations", requireRole("receptionist", "physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { search, status, department } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(full_name) LIKE $${params.length} OR lower(registration_code) LIKE $${params.length} OR lower(occupation) LIKE $${params.length})`
    );
  }
  if (status && status !== "all") {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }
  if (department && department !== "all") {
    params.push(department);
    conditions.push(`department = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT * FROM employee_registrations ${where} ORDER BY registration_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/registrations/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const regResult = await query(`SELECT * FROM employee_registrations WHERE id = $1;`, [req.params.id]);
  const registration = regResult.rows[0];
  if (!registration) throw new ApiError(404, "registration_not_found", "Registration not found.");

  const certsResult = await query(
    `SELECT c.*, row_to_json(ph.*) AS physician
     FROM medical_certifications c
     JOIN physicians ph ON ph.id = c.physician_id
     WHERE c.employee_registration_id = $1
     ORDER BY c.examination_date DESC;`,
    [req.params.id]
  );

  const hiredPatientResult = await query(
    `SELECT * FROM patients WHERE source_employee_registration_id = $1;`,
    [req.params.id]
  );

  const hiredStaffResult = await query(
    `SELECT * FROM clinic_staff WHERE source_employee_registration_id = $1;`,
    [req.params.id]
  );

  res.json({
    ...registration,
    certifications: certsResult.rows,
    hired_patient: hiredPatientResult.rows[0] || null,
    hired_staff: hiredStaffResult.rows[0] || null,
  });
}));

router.post("/registrations", requireRole("receptionist", "physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { full_name, occupation, date_of_birth, gender, location, photo_url, department, position } = req.body;
  if (!full_name || !full_name.trim()) {
    throw new ApiError(422, "full_name_required", "Full name is required.");
  }
  if (!department || !department.trim()) {
    throw new ApiError(422, "department_required", "Department is required.");
  }
  if (!position || !position.trim()) {
    throw new ApiError(422, "position_required", "Position is required.");
  }
  if (!occupation || !occupation.trim()) {
    throw new ApiError(422, "occupation_required", "Occupation applied for is required.");
  }

  const result = await query(
    `INSERT INTO employee_registrations (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position)
     VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, 'pending', $7, $8)
     RETURNING *;`,
    [full_name.trim(), date_of_birth || null, gender || null, location || "", occupation.trim(), photo_url || null, department.trim(), position.trim()]
  );
  res.status(201).json(result.rows[0]);
}));

router.put("/registrations/:id", requireRole("receptionist", "physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const currentResult = await query(`SELECT * FROM employee_registrations WHERE id = $1;`, [req.params.id]);
  const current = currentResult.rows[0];
  if (!current) throw new ApiError(404, "registration_not_found", "Registration not found.");
  if (current.status === "hired") {
    throw new ApiError(
      422,
      "registration_locked",
      "This candidate has already been hired; the registration record is permanent and cannot be edited."
    );
  }

  const editable = ["full_name", "date_of_birth", "gender", "location", "occupation", "photo_url", "status", "department", "position"];
  const updates = [];
  const params = [];
  for (const key of editable) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }

  if (updates.length === 0) return res.json(current);

  params.push(req.params.id);
  const result = await query(
    `UPDATE employee_registrations SET ${updates.join(", ")} WHERE id = $${params.length} RETURNING *;`,
    params
  );
  res.json(result.rows[0]);
}));



// POST /registrations/:id/accept-as-staff
// Restricted to hr_admin and physician roles.
// Converts a certified_fit candidate into a clinic staff member (CI-series).
router.post("/registrations/:id/accept-as-staff", requireRole("receptionist", "physician", "system_administrator", "hr_admin"), ACCEPT_AS_STAFF_ROLES, asyncHandler(async (req, res) => {
  const regResult = await query(`SELECT * FROM employee_registrations WHERE id = $1;`, [req.params.id]);
  const registration = regResult.rows[0];
  if (!registration) throw new ApiError(404, "registration_not_found", "Registration not found.");
  if (registration.status !== "certified_fit") {
    throw new ApiError(422, "not_certified_fit", "Only candidates certified as fit can be accepted as staff.");
  }

  // Guard: already converted?
  const existingStaff = await query(
    `SELECT id, staff_code FROM clinic_staff WHERE source_employee_registration_id = $1;`,
    [req.params.id]
  );
  if (existingStaff.rows[0]) {
    throw new ApiError(
      422,
      "already_accepted_as_staff",
      `This candidate was already accepted as staff (${existingStaff.rows[0].staff_code}).`
    );
  }

  const { date_recruited, license_no, qualification } = req.body;
  const prefix = registration.department === 'Medical' ? 'CI' : 'E';

  const result = await withTransaction(async (client) => {
    const staffResult = await client.query(
      `INSERT INTO clinic_staff
         (staff_code, full_name, gender, date_of_birth, department, position,
          date_recruited, license_no, qualification,
          source_employee_registration_id, accepted_by_user_id)
       VALUES
         ($1 || lpad(nextval('staff_code_seq')::text, 3, '0'),
          $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *;`,
      [
        prefix,
        registration.full_name,
        registration.gender || null,
        registration.date_of_birth || null,
        registration.department,
        registration.position,
        date_recruited || null,
        license_no || null,
        qualification || null,
        registration.id,
        req.user.id,
      ]
    );

    const patientResult = await client.query(
      `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url, source_employee_registration_id)
       VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, '', '', $5, $6)
       RETURNING *;`,
      [registration.full_name, registration.date_of_birth || null, registration.gender || null, registration.location || null, registration.photo_url || null, registration.id]
    );

    let physicianResult = null;
    if (registration.department === 'Medical') {
      physicianResult = await client.query(
        `INSERT INTO physicians (full_name, gender, date_recruited, license_no, qualification, is_active, photo_url, source_employee_registration_id)
         VALUES ($1, $2, $3, $4, $5, true, $6, $7)
         RETURNING *;`,
        [registration.full_name, registration.gender || null, date_recruited || null, license_no || null, qualification || null, registration.photo_url || null, registration.id]
      );
    }

    const updatedRegResult = await client.query(
      `UPDATE employee_registrations SET status = 'accepted_as_staff' WHERE id = $1 RETURNING *;`,
      [registration.id]
    );

    return { 
      staff: staffResult.rows[0], 
      patient: patientResult.rows[0], 
      registration: updatedRegResult.rows[0],
      physician: physicianResult ? physicianResult.rows[0] : null
    };
  });

  res.status(201).json(result);
}));

// POST /registrations/import
// Bulk-import pre-employment registrations from an array of row objects.
// Supports two modes:
//   atomic=true  → All-or-nothing: if any row fails, ROLLBACK and save nothing.
//   atomic=false → Stop-on-error: commit rows 1…K-1, stop at row K, report error & remaining rows.
router.post("/registrations/import", requireRole("receptionist", "physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { records, atomic = false } = req.body;

  if (!Array.isArray(records) || records.length === 0) {
    throw new ApiError(422, "import_records_required", "records must be a non-empty array.");
  }

  const REQUIRED_FIELDS = ["full_name", "department", "position", "occupation"];
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
    if (!VALID_DEPARTMENTS.includes(row.department.trim())) {
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

  // ---------- ATOMIC MODE: validate all rows first, then insert in one transaction ----------
  if (atomic) {
    for (let i = 0; i < records.length; i++) {
      const err = validateRow(records[i]);
      if (err) {
        return res.status(422).json({
          success: false,
          mode: "atomic",
          successCount: 0,
          failedRowIndex: i + 1,          // 1-based for user display
          failedRow: records[i],
          error: err,
          remainingRows: records.slice(i), // rows not yet processed (including failed)
        });
      }
    }

    // All rows valid — insert inside a single transaction
    const inserted = await withTransaction(async (client) => {
      const results = [];
      for (const row of records) {
        const r = await client.query(
          `INSERT INTO employee_registrations
             (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position)
           VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'),
                   $1, $2, $3, $4, $5, $6, 'pending', $7, $8)
           RETURNING *;`,
          [
            row.full_name.trim(),
            row.date_of_birth || null,
            (row.gender || "").toLowerCase() || null,
            row.location || "",
            row.occupation.trim(),
            row.photo_url || null,
            row.department.trim(),
            row.position.trim(),
          ]
        );
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

  // ---------- PARTIAL MODE: commit rows one-by-one, stop on first error ----------
  const committed = [];
  for (let i = 0; i < records.length; i++) {
    const row = records[i];

    // Client-side validation first (no DB round-trip)
    const err = validateRow(row);
    if (err) {
      return res.status(207).json({
        success: false,
        mode: "partial",
        successCount: committed.length,
        failedRowIndex: i + 1,
        failedRow: row,
        error: err,
        remainingRows: records.slice(i), // from the failed row onward
      });
    }

    // DB insert (each row its own implicit transaction so prior rows are already durable)
    try {
      const result = await query(
        `INSERT INTO employee_registrations
           (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position)
         VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'),
                 $1, $2, $3, $4, $5, $6, 'pending', $7, $8)
         RETURNING *;`,
        [
          row.full_name.trim(),
          row.date_of_birth || null,
          (row.gender || "").toLowerCase() || null,
          row.location || "",
          row.occupation.trim(),
          row.photo_url || null,
          row.department.trim(),
          row.position.trim(),
        ]
      );
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

router.delete("/registrations/:id", requireRole("system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM employee_registrations WHERE id = $1 RETURNING id;`, [req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "registration_not_found", "Registration not found.");
  res.json({ success: true, id: result.rows[0].id });
}));

module.exports = router;
