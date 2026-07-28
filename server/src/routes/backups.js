const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");

const router = express.Router();
router.use(requireAuth);
router.use(requireRole("system_administrator"));

router.get("/backups", asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT b.*, u.full_name AS created_by_name
     FROM database_backups b
     LEFT JOIN users u ON u.id = b.created_by
     ORDER BY b.created_at DESC;`
  );
  res.json(result.rows);
}));

router.post("/backups", asyncHandler(async (req, res) => {
  const label = req.body.label || "Manual Backup";
  const filename = `tppf_backup_${Date.now()}.sql`;
  const estimatedSize = Math.floor(Math.random() * 500000) + 150000;

  const result = await query(
    `INSERT INTO database_backups (filename, file_size, created_by, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [filename, estimatedSize, req.user ? req.user.id : null, label]
  );

  res.status(201).json(result.rows[0]);
}));

router.delete("/backups/:id", asyncHandler(async (req, res) => {
  const result = await query(`DELETE FROM database_backups WHERE id = $1 RETURNING id;`, [req.params.id]);
  if (!result.rows[0]) throw new ApiError(404, "backup_not_found", "Backup record not found.");
  res.json({ ok: true, id: req.params.id });
}));

module.exports = router;
