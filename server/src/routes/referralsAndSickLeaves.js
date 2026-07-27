const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

router.get("/referrals", asyncHandler(async (req, res) => {
  const { search, visit_id } = req.query;
  const conditions = [];
  const params = [];

  if (visit_id) {
    params.push(visit_id);
    conditions.push(`r.visit_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT r.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     ${where}
     ORDER BY r.referral_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/referrals/:id", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT r.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     WHERE r.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "referral_not_found", "Referral not found.");
  res.json(result.rows[0]);
}));

router.post("/referrals", asyncHandler(async (req, res) => {
  const { visit_id, physician_id, diagnosis, reason, referred_to, note } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");
  if (!referred_to || !referred_to.trim()) {
    throw new ApiError(422, "referred_to_required", "Enter where the patient is being referred to.");
  }

  const visitResult = await query(`SELECT patient_id FROM visits WHERE id = $1;`, [visit_id]);
  if (!visitResult.rows[0]) throw new ApiError(422, "invalid_visit", "Select a valid visit.");

  const result = await query(
    `INSERT INTO referrals (visit_id, patient_id, physician_id, diagnosis, reason, referred_to, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *;`,
    [visit_id, visitResult.rows[0].patient_id, physician_id || null, diagnosis || null, reason || null, referred_to.trim(), note || null]
  );
  res.status(201).json(result.rows[0]);
}));

router.get("/sick-leaves", asyncHandler(async (req, res) => {
  const { search, visit_id } = req.query;
  const conditions = [];
  const params = [];

  if (visit_id) {
    params.push(visit_id);
    conditions.push(`s.visit_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(`(lower(p.full_name) LIKE $${params.length} OR lower(p.patient_code) LIKE $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT s.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM sick_leaves s
     JOIN patients p ON p.id = s.patient_id
     ${where}
     ORDER BY s.leave_start DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/sick-leaves/:id", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT s.*, p.full_name AS patient_name, p.patient_code AS patient_code
     FROM sick_leaves s
     JOIN patients p ON p.id = s.patient_id
     WHERE s.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "sick_leave_not_found", "Sick leave not found.");
  res.json(result.rows[0]);
}));

router.post("/sick-leaves", asyncHandler(async (req, res) => {
  const { visit_id, physician_id, diagnosis, exam_date, leave_start, leave_end } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");
  if (!leave_start || !leave_end) throw new ApiError(422, "dates_required", "Enter both a start and end date.");
  if (leave_end < leave_start) throw new ApiError(422, "invalid_date_range", "The end date cannot be before the start date.");

  const visitResult = await query(`SELECT patient_id FROM visits WHERE id = $1;`, [visit_id]);
  if (!visitResult.rows[0]) throw new ApiError(422, "invalid_visit", "Select a valid visit.");

  const result = await query(
    `INSERT INTO sick_leaves (visit_id, patient_id, physician_id, diagnosis, exam_date, leave_start, leave_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *;`,
    [visit_id, visitResult.rows[0].patient_id, physician_id || null, diagnosis || null, exam_date || null, leave_start, leave_end]
  );
  res.status(201).json(result.rows[0]);
}));

module.exports = router;
