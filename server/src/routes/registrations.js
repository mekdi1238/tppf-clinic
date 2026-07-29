const express = require("express");
const { query, withTransaction } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("receptionist", "physician", "system_administrator", "hr_admin"));

// Only hr_admin and physician can accept a candidate as staff
const ACCEPT_AS_STAFF_ROLES = requireRole("hr_admin", "physician", "system_administrator");

router.get("/registrations", asyncHandler(async (req, res) => {
  const { search, status } = req.query;
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

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT * FROM employee_registrations ${where} ORDER BY registration_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/registrations/:id", asyncHandler(async (req, res) => {
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

router.post("/registrations", asyncHandler(async (req, res) => {
  const { full_name, occupation, date_of_birth, gender, location, photo_url } = req.body;
  if (!full_name || !full_name.trim()) {
    throw new ApiError(422, "full_name_required", "Full name is required.");
  }
  if (!occupation || !occupation.trim()) {
    throw new ApiError(422, "occupation_required", "Occupation applied for is required.");
  }

  const result = await query(
    `INSERT INTO employee_registrations (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status)
     VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *;`,
    [full_name.trim(), date_of_birth || null, gender || null, location || "", occupation.trim(), photo_url || null]
  );
  res.status(201).json(result.rows[0]);
}));

router.put("/registrations/:id", asyncHandler(async (req, res) => {
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

  const editable = ["full_name", "date_of_birth", "gender", "location", "occupation", "photo_url", "status"];
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

router.post("/registrations/:id/hire", asyncHandler(async (req, res) => {
  const regResult = await query(`SELECT * FROM employee_registrations WHERE id = $1;`, [req.params.id]);
  const registration = regResult.rows[0];
  if (!registration) throw new ApiError(404, "registration_not_found", "Registration not found.");
  if (registration.status !== "certified_fit") {
    throw new ApiError(422, "not_certified_fit", "Only candidates certified fit can be hired.");
  }

  const hired = await withTransaction(async (client) => {
    const patientResult = await client.query(
      `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url, source_employee_registration_id)
       VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, '', '', $5, $6)
       RETURNING *;`,
      [registration.full_name, registration.date_of_birth, registration.gender, registration.location, registration.photo_url || null, registration.id]
    );

    const updatedRegResult = await client.query(
      `UPDATE employee_registrations SET status = 'hired' WHERE id = $1 RETURNING *;`,
      [registration.id]
    );

    return { patient: patientResult.rows[0], registration: updatedRegResult.rows[0] };
  });

  res.json(hired);
}));

// POST /registrations/:id/accept-as-staff
// Restricted to hr_admin and physician roles.
// Converts a certified_fit candidate into a clinic staff member (CI-series).
router.post("/registrations/:id/accept-as-staff", ACCEPT_AS_STAFF_ROLES, asyncHandler(async (req, res) => {
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

  const { department, position, date_recruited, license_no, qualification } = req.body;
  if (!department || !department.trim()) throw new ApiError(422, "department_required", "Department is required.");
  if (!position || !position.trim()) throw new ApiError(422, "position_required", "Position is required.");

  const result = await withTransaction(async (client) => {
    const staffResult = await client.query(
      `INSERT INTO clinic_staff
         (staff_code, full_name, gender, date_of_birth, department, position,
          date_recruited, license_no, qualification,
          source_employee_registration_id, accepted_by_user_id)
       VALUES
         ('CI' || lpad(nextval('staff_code_seq')::text, 3, '0'),
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *;`,
      [
        registration.full_name,
        registration.gender || null,
        registration.date_of_birth || null,
        department.trim(),
        position.trim(),
        date_recruited || null,
        license_no || null,
        qualification || null,
        registration.id,
        req.user.id,
      ]
    );

    const updatedRegResult = await client.query(
      `UPDATE employee_registrations SET status = 'accepted_as_staff' WHERE id = $1 RETURNING *;`,
      [registration.id]
    );

    return { staff: staffResult.rows[0], registration: updatedRegResult.rows[0] };
  });

  res.status(201).json(result);
}));

module.exports = router;
