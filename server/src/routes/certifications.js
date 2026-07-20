const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);

const CERTIFIABLE_STATUSES = ["pending", "certified_fit", "certified_unfit"];

router.get("/certifications", asyncHandler(async (req, res) => {
  const { search, result } = req.query;
  const conditions = [];
  const params = [];

  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    conditions.push(
      `(lower(r.full_name) LIKE $${params.length} OR lower(r.registration_code) LIKE $${params.length})`
    );
  }
  if (result && result !== "all") {
    params.push(result);
    conditions.push(`c.result = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await query(
    `SELECT c.*,
            row_to_json(r.*) AS registration,
            row_to_json(ph.*) AS physician
     FROM medical_certifications c
     JOIN employee_registrations r ON r.id = c.employee_registration_id
     JOIN physicians ph ON ph.id = c.physician_id
     ${where}
     ORDER BY c.examination_date DESC;`,
    params
  );
  res.json(rows.rows);
}));

router.get("/certifications/:id", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT c.*,
            row_to_json(r.*) AS registration,
            row_to_json(ph.*) AS physician
     FROM medical_certifications c
     JOIN employee_registrations r ON r.id = c.employee_registration_id
     JOIN physicians ph ON ph.id = c.physician_id
     WHERE c.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "certification_not_found", "Certification not found.");
  res.json(result.rows[0]);
}));

router.post("/certifications", asyncHandler(async (req, res) => {
  const {
    employee_registration_id, physician_id, result,
    physical_examination, personal_hygiene, skin_disease, stool_exam_direct,
    syphilis, gonorrhea, other_findings, treatment_note, treatment_result_note,
  } = req.body;

  const regResult = await query(`SELECT * FROM employee_registrations WHERE id = $1;`, [employee_registration_id]);
  const registration = regResult.rows[0];
  if (!registration) throw new ApiError(422, "invalid_registration", "Select a valid candidate.");
  if (!CERTIFIABLE_STATUSES.includes(registration.status)) {
    throw new ApiError(
      422,
      "registration_not_certifiable",
      `Cannot record a new exam for a candidate whose status is "${registration.status}".`
    );
  }
  if (!physician_id) throw new ApiError(422, "physician_required", "Select the examining physician.");
  if (result !== "fit" && result !== "unfit") {
    throw new ApiError(422, "invalid_result", "Exam result must be recorded as fit or unfit.");
  }

  const certResult = await query(
    `INSERT INTO medical_certifications
       (employee_registration_id, physician_id, examination_date, physical_examination, personal_hygiene,
        skin_disease, stool_exam_direct, syphilis, gonorrhea, other_findings, result, treatment_note, treatment_result_note)
     VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *;`,
    [
      employee_registration_id, physician_id,
      physical_examination || "", personal_hygiene || "", skin_disease || "", stool_exam_direct || "",
      syphilis || "", gonorrhea || "", other_findings || "", result, treatment_note || "", treatment_result_note || "",
    ]
  );

  const newStatus = result === "fit" ? "certified_fit" : "certified_unfit";
  const updatedRegResult = await query(
    `UPDATE employee_registrations SET status = $1 WHERE id = $2 RETURNING *;`,
    [newStatus, employee_registration_id]
  );

  res.status(201).json({ certification: certResult.rows[0], registration: updatedRegResult.rows[0] });
}));

module.exports = router;
