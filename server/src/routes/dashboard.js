const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");

const router = express.Router();
router.use(requireAuth);

router.get("/dashboard/stats", asyncHandler(async (req, res) => {
  const activePatients = await query(`SELECT count(*) FROM patients WHERE is_active = true;`);
  const openVisits = await query(`SELECT count(*) FROM visits WHERE status != 'closed';`);
  const visitsToday = await query(
    `SELECT count(*) FROM visits WHERE visit_date::date = now()::date;`
  );
  const newPatientsWeek = await query(
    `SELECT count(*) FROM patients WHERE registered_date >= now() - interval '7 days';`
  );
  const visitsByDay = await query(`
    SELECT to_char(d, 'Dy') AS label, count(v.id) AS count
    FROM generate_series(now()::date - interval '6 days', now()::date, interval '1 day') d
    LEFT JOIN visits v ON v.visit_date::date = d::date
    GROUP BY d
    ORDER BY d;
  `);
  const visitsByStatusRows = await query(
    `SELECT status, count(*) FROM visits GROUP BY status;`
  );
  const visitsByStatus = { open: 0, examined: 0, diagnosed: 0, closed: 0 };
  for (const row of visitsByStatusRows.rows) {
    visitsByStatus[row.status] = parseInt(row.count, 10);
  }

  res.json({
    active_patients: parseInt(activePatients.rows[0].count, 10),
    open_visits: parseInt(openVisits.rows[0].count, 10),
    visits_today: parseInt(visitsToday.rows[0].count, 10),
    new_patients_week: parseInt(newPatientsWeek.rows[0].count, 10),
    visits_by_day: visitsByDay.rows.map((r) => ({ label: r.label, count: parseInt(r.count, 10) })),
    visits_by_status: visitsByStatus,
  });
}));

router.get("/physicians", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, full_name, gender, date_recruited, license_no, qualification, is_active
     FROM physicians WHERE is_active = true ORDER BY full_name;`
  );
  res.json(result.rows);
}));

module.exports = router;
