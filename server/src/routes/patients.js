const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

const CLINICAL_READ = requireRole("receptionist", "physician", "lab_technician", "pharmacist", "system_administrator", "hr_admin");
const CLINICAL_WRITE = requireRole("receptionist", "physician", "system_administrator", "hr_admin");

const router = express.Router();
router.use(requireAuth);

router.get("/patients", CLINICAL_READ, asyncHandler(async (req, res) => {
  const { search, status } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(full_name) LIKE $${params.length} OR lower(patient_code) LIKE $${params.length} OR phone LIKE $${params.length})`
    );
  }
  if (status === "active") conditions.push("is_active = true");
  if (status === "inactive") conditions.push("is_active = false");

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT * FROM patients ${where} ORDER BY registered_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/patients/:id", CLINICAL_READ, asyncHandler(async (req, res) => {
  const patientResult = await query(`SELECT * FROM patients WHERE id = $1;`, [req.params.id]);
  const patient = patientResult.rows[0];
  if (!patient) throw new ApiError(404, "patient_not_found", "Patient not found.");

  const visitsResult = await query(
    `SELECT * FROM visits WHERE patient_id = $1 ORDER BY visit_date DESC;`,
    [req.params.id]
  );

  res.json({ ...patient, visits: visitsResult.rows });
}));

router.post("/patients", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const { full_name, date_of_birth, gender, location, address, phone, photo_url } = req.body;
  if (!full_name || !full_name.trim()) {
    throw new ApiError(422, "full_name_required", "Full name is required.");
  }

  const result = await query(
    `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone, photo_url)
     VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, $7)
     RETURNING *;`,
    [full_name.trim(), date_of_birth || null, gender || null, location || "", address || "", phone || "", photo_url || null]
  );
  res.status(201).json(result.rows[0]);
}));

router.put("/patients/:id", CLINICAL_WRITE, asyncHandler(async (req, res) => {
  const editable = ["full_name", "date_of_birth", "gender", "location", "address", "phone", "photo_url", "is_active"];
  const updates = [];
  const params = [];

  for (const key of editable) {
    if (req.body[key] !== undefined) {
      params.push(req.body[key]);
      updates.push(`${key} = $${params.length}`);
    }
  }

  if (updates.length === 0) {
    const existing = await query(`SELECT * FROM patients WHERE id = $1;`, [req.params.id]);
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

router.delete("/patients/:id", requireRole("system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM patients WHERE id = $1 RETURNING id;`, [req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "patient_not_found", "Patient not found.");
  res.json({ success: true, id: result.rows[0].id });
}));

module.exports = router;
