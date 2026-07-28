const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("receptionist", "physician", "system_administrator", "hr_admin"));

// GET /visits/:id/vitals — list all vitals readings for a visit, newest first
router.get("/visits/:id/vitals", asyncHandler(async (req, res) => {
  const visitResult = await query(`SELECT id FROM visits WHERE id = $1;`, [req.params.id]);
  if (!visitResult.rows[0]) throw new ApiError(404, "visit_not_found", "Visit not found.");

  const result = await query(
    `SELECT * FROM vitals WHERE visit_id = $1 ORDER BY recorded_at DESC;`,
    [req.params.id]
  );
  res.json(result.rows);
}));

// POST /visits/:id/vitals — record a new vitals reading
router.post("/visits/:id/vitals", asyncHandler(async (req, res) => {
  const visitResult = await query(`SELECT id FROM visits WHERE id = $1;`, [req.params.id]);
  if (!visitResult.rows[0]) throw new ApiError(404, "visit_not_found", "Visit not found.");

  const {
    temperature_c, blood_pressure_systolic, blood_pressure_diastolic,
    pulse_rate, respiratory_rate, weight_kg, height_cm,
  } = req.body;

  const hasAnyReading = [
    temperature_c, blood_pressure_systolic, blood_pressure_diastolic,
    pulse_rate, respiratory_rate, weight_kg, height_cm,
  ].some((v) => v !== undefined && v !== null && v !== "");

  if (!hasAnyReading) {
    throw new ApiError(422, "no_readings_provided", "Enter at least one vital sign reading.");
  }

  const result = await query(
    `INSERT INTO vitals
       (visit_id, recorded_by, temperature_c, blood_pressure_systolic, blood_pressure_diastolic,
        pulse_rate, respiratory_rate, weight_kg, height_cm)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *;`,
    [
      req.params.id, req.user.id,
      temperature_c || null, blood_pressure_systolic || null, blood_pressure_diastolic || null,
      pulse_rate || null, respiratory_rate || null, weight_kg || null, height_cm || null,
    ]
  );
  res.status(201).json(result.rows[0]);
}));

module.exports = router;
