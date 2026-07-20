const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

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

  res.json({
    ...registration,
    certifications: certsResult.rows,
    hired_patient: hiredPatientResult.rows[0] || null,
  });
}));

router.post("/registrations", asyncHandler(async (req, res) => {
  const { full_name, occupation, date_of_birth, gender, location } = req.body;
  if (!full_name || !full_name.trim()) {
    throw new ApiError(422, "full_name_required", "Full name is required.");
  }
  if (!occupation || !occupation.trim()) {
    throw new ApiError(422, "occupation_required", "Occupation applied for is required.");
  }

  const result = await query(
    `INSERT INTO employee_registrations (registration_code, full_name, date_of_birth, gender, location, occupation, status)
     VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, 'pending')
     RETURNING *;`,
    [full_name.trim(), date_of_birth || null, gender || null, location || "", occupation.trim()]
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

  const editable = ["full_name", "date_of_birth", "gender", "location", "occupation", "status"];
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

  const patientResult = await query(
    `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, source_employee_registration_id)
     VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, '', '', $5)
     RETURNING *;`,
    [registration.full_name, registration.date_of_birth, registration.gender, registration.location, registration.id]
  );

  const updatedRegResult = await query(
    `UPDATE employee_registrations SET status = 'hired' WHERE id = $1 RETURNING *;`,
    [registration.id]
  );

  res.json({ patient: patientResult.rows[0], registration: updatedRegResult.rows[0] });
}));

module.exports = router;
