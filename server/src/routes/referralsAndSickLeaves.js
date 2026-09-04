const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");

const router = express.Router();
router.use(requireAuth);

router.get("/referrals", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
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
    `SELECT r.*,
            p.full_name AS patient_name,
            p.patient_code AS patient_code,
            p.gender AS patient_gender,
            p.date_of_birth AS patient_dob,
            p.phone AS patient_phone,
            p.location AS patient_location,
            p.address AS patient_address,
            COALESCE(p.department, er.department) AS patient_department,
            COALESCE(p.position, er.position) AS patient_position,
            ph.full_name AS physician_name,
            ph.qualification AS physician_qualification,
            ph.license_no AS physician_license_no,
            v.treatment AS visit_treatment,
            v.chief_complaint AS visit_chief_complaint,
            v.examination_notes AS visit_exam_notes
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     LEFT JOIN physicians ph ON ph.id = r.physician_id
     LEFT JOIN visits v ON v.id = r.visit_id
     ${where}
     ORDER BY r.referral_date DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/referrals/:id", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT r.*,
            p.full_name AS patient_name,
            p.patient_code AS patient_code,
            p.gender AS patient_gender,
            p.date_of_birth AS patient_dob,
            p.phone AS patient_phone,
            p.location AS patient_location,
            p.address AS patient_address,
            COALESCE(p.department, er.department) AS patient_department,
            COALESCE(p.position, er.position) AS patient_position,
            ph.full_name AS physician_name,
            ph.qualification AS physician_qualification,
            ph.license_no AS physician_license_no,
            v.treatment AS visit_treatment,
            v.chief_complaint AS visit_chief_complaint,
            v.examination_notes AS visit_exam_notes
     FROM referrals r
     JOIN patients p ON p.id = r.patient_id
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     LEFT JOIN physicians ph ON ph.id = r.physician_id
     LEFT JOIN visits v ON v.id = r.visit_id
     WHERE r.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "referral_not_found", "Referral not found.");
  res.json(result.rows[0]);
}));

router.post("/referrals", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { visit_id, physician_id, diagnosis, reason, referred_to, note } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");
  if (!referred_to || !referred_to.trim()) {
    throw new ApiError(422, "referred_to_required", "Enter where the patient is being referred to.");
  }

  const visitResult = await query(`SELECT patient_id, physician_id FROM visits WHERE id = $1;`, [visit_id]);
  if (!visitResult.rows[0]) throw new ApiError(422, "invalid_visit", "Select a valid visit.");
  const effectivePhysicianId = physician_id || visitResult.rows[0].physician_id;

  const result = await query(
    `INSERT INTO referrals (visit_id, patient_id, physician_id, diagnosis, reason, referred_to, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *;`,
    [visit_id, visitResult.rows[0].patient_id, effectivePhysicianId, diagnosis || null, reason || null, referred_to.trim(), note || null]
  );

  const referral = result.rows[0];

  await logAudit(req, {
    action: "create",
    module: "referrals",
    tableName: "referrals",
    recordId: referral.id,
    description: `Created medical referral #${referral.id} to '${referred_to.trim()}' for Patient #${visitResult.rows[0].patient_id}`,
    afterData: referral,
  });

  res.status(201).json(referral);
}));

async function processExpiredSickLeaves() {
  try {
    const expiredResult = await query(
      `SELECT s.*, p.full_name AS patient_name, p.patient_code
       FROM sick_leaves s
       JOIN patients p ON p.id = s.patient_id
       WHERE s.leave_end <= CURRENT_DATE
         AND s.auto_visit_created_at IS NULL;`
    );

    for (const sl of expiredResult.rows) {
      const physResult = await query(`SELECT id FROM physicians WHERE is_active = true ORDER BY full_name LIMIT 1;`);
      const physId = physResult.rows[0] ? physResult.rows[0].id : sl.physician_id;

      const visitRes = await query(
        `INSERT INTO visits (patient_id, physician_id, status, chief_complaint, examination_notes)
         VALUES ($1, $2, 'open', $3, '')
         RETURNING id;`,
        [sl.patient_id, physId, `Follow-up Checkup after Sick Leave (Auto-scheduled)`]
      );

      const visitId = visitRes.rows[0].id;

      await query(
        `UPDATE sick_leaves
         SET auto_visit_created_at = now(), auto_visit_id = $1
         WHERE id = $2;`,
        [visitId, sl.id]
      );
    }
  } catch (err) {
    console.error("Error processing expired sick leaves:", err);
  }
}

router.get("/sick-leaves", requireRole("physician", "system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  await processExpiredSickLeaves();

  const { search, visit_id, department } = req.query;
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

  const userDept = req.user && req.user.department ? req.user.department : null;
  const isManager = userDept && userDept.toLowerCase() === "manager";
  const targetDept = department || (isManager ? "all" : userDept);
  if (targetDept && targetDept !== "all") {
    params.push(targetDept);
    params.push(req.user.id);
    conditions.push(`(COALESCE(p.department, er.department) = $${params.length - 1} OR v.created_by_user_id = $${params.length})`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await query(
    `SELECT s.*,
            (GREATEST(1, s.leave_end::date - s.leave_start::date + 1)) AS days,
            p.full_name AS patient_name,
            p.patient_code AS patient_code,
            p.gender AS patient_gender,
            p.date_of_birth AS patient_dob,
            p.phone AS patient_phone,
            p.location AS patient_location,
            p.address AS patient_address,
            COALESCE(p.department, er.department) AS department,
            COALESCE(p.position, er.position) AS position,
            ph.full_name AS physician_name,
            ph.qualification AS physician_qualification,
            ph.license_no AS physician_license_no,
            v.treatment AS visit_treatment,
            v.examination_notes AS visit_exam_notes
     FROM sick_leaves s
     JOIN patients p ON p.id = s.patient_id
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     LEFT JOIN visits v ON v.id = s.visit_id
     LEFT JOIN physicians ph ON ph.id = s.physician_id
     ${where}
     ORDER BY s.leave_start DESC;`,
    params
  );
  res.json(result.rows);
}));

router.get("/sick-leaves/:id", requireRole("physician", "system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT s.*,
            (GREATEST(1, s.leave_end::date - s.leave_start::date + 1)) AS days,
            p.full_name AS patient_name,
            p.patient_code AS patient_code,
            p.gender AS patient_gender,
            p.date_of_birth AS patient_dob,
            p.phone AS patient_phone,
            p.location AS patient_location,
            p.address AS patient_address,
            COALESCE(p.department, er.department) AS department,
            COALESCE(p.position, er.position) AS position,
            ph.full_name AS physician_name,
            ph.qualification AS physician_qualification,
            ph.license_no AS physician_license_no,
            v.treatment AS visit_treatment,
            v.examination_notes AS visit_exam_notes
     FROM sick_leaves s
     JOIN patients p ON p.id = s.patient_id
     LEFT JOIN employee_registrations er ON er.id = p.source_employee_registration_id
     LEFT JOIN visits v ON v.id = s.visit_id
     LEFT JOIN physicians ph ON ph.id = s.physician_id
     WHERE s.id = $1;`,
    [req.params.id]
  );
  if (!result.rows[0]) throw new ApiError(404, "sick_leave_not_found", "Sick leave not found.");
  res.json(result.rows[0]);
}));

router.post("/sick-leaves", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const { visit_id, physician_id, diagnosis, exam_date, leave_start, leave_end } = req.body;
  if (!visit_id) throw new ApiError(422, "visit_required", "A visit is required.");
  if (!leave_start || !leave_end) throw new ApiError(422, "dates_required", "Enter both a start and end date.");
  if (leave_end < leave_start) throw new ApiError(422, "invalid_date_range", "The end date cannot be before the start date.");

  const visitResult = await query(`SELECT patient_id, physician_id FROM visits WHERE id = $1;`, [visit_id]);
  if (!visitResult.rows[0]) throw new ApiError(422, "invalid_visit", "Select a valid visit.");
  const effectivePhysicianId = physician_id || visitResult.rows[0].physician_id;

  const result = await query(
    `INSERT INTO sick_leaves (visit_id, patient_id, physician_id, diagnosis, exam_date, leave_start, leave_end)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *;`,
    [visit_id, visitResult.rows[0].patient_id, effectivePhysicianId, diagnosis || null, exam_date || null, leave_start, leave_end]
  );

  const sickLeave = result.rows[0];

  await logAudit(req, {
    action: "create",
    module: "referrals",
    tableName: "sick_leaves",
    recordId: sickLeave.id,
    description: `Created medical sick leave #${sickLeave.id} (${leave_start} to ${leave_end}) for Patient #${visitResult.rows[0].patient_id}`,
    afterData: sickLeave,
  });

  res.status(201).json(sickLeave);
}));

router.delete("/referrals/:id", requireRole("physician", "system_administrator", "hr_admin"), asyncHandler(async (req, res) => {
  const referralId = req.params.id;
  const existing = await query(`SELECT * FROM referrals WHERE id = $1;`, [referralId]);
  if (!existing.rows[0]) throw new ApiError(404, "referral_not_found", "Referral not found.");

  await query(`DELETE FROM referrals WHERE id = $1;`, [referralId]);

  await logAudit(req, {
    action: "delete",
    module: "referrals",
    tableName: "referrals",
    recordId: Number(referralId),
    description: `Deleted referral #${referralId}`,
    beforeData: existing.rows[0],
  });

  res.json({ success: true, id: referralId });
}));

router.delete("/sick-leaves/:id", requireRole("physician", "system_administrator", "hr_admin", "department_hr"), asyncHandler(async (req, res) => {
  const sickLeaveId = req.params.id;
  const existing = await query(`SELECT * FROM sick_leaves WHERE id = $1;`, [sickLeaveId]);
  if (!existing.rows[0]) throw new ApiError(404, "sick_leave_not_found", "Sick leave not found.");

  await query(`DELETE FROM sick_leaves WHERE id = $1;`, [sickLeaveId]);

  await logAudit(req, {
    action: "delete",
    module: "referrals",
    tableName: "sick_leaves",
    recordId: Number(sickLeaveId),
    description: `Deleted sick leave #${sickLeaveId}`,
    beforeData: existing.rows[0],
  });

  res.json({ success: true, id: sickLeaveId });
}));

module.exports = router;

