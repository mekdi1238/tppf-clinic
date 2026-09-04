const express = require("express");
const { query } = require("../db/pool");
const asyncHandler = require("../utils/asyncHandler");
const requireAuth = require("../middleware/requireAuth");
const requireRole = require("../middleware/requireRole");
const { ApiError } = require("../middleware/errorHandler");
const { logAudit } = require("../services/auditLogger");
const backupService = require("../services/backupService");
const backupScheduler = require("../services/backupScheduler");

const router = express.Router();
router.use(requireAuth);

const BACKUP_ADMIN = requireRole("system_administrator");

// List all backups
router.get("/backups", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT b.*, u.full_name AS created_by_name, u.username AS created_by_username
     FROM database_backups b
     LEFT JOIN users u ON u.id = b.created_by
     ORDER BY b.created_at DESC;`
  );
  res.json(result.rows);
}));

// Get current automatic backup schedule
router.get("/backups/schedule", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const schedule = await backupScheduler.getSchedule();
  res.json(schedule);
}));

// Update automatic backup schedule
router.put("/backups/schedule", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const { enabled, frequency, time_of_day, day_of_week, retention_count } = req.body;

  const current = await backupScheduler.getSchedule();
  const updated = await backupScheduler.updateSchedule({
    enabled,
    frequency,
    time_of_day,
    day_of_week,
    retention_count,
  });

  await logAudit(req, {
    action: "update",
    module: "backups",
    tableName: "backup_schedule",
    recordId: 1,
    description: `Updated automatic backup schedule (${updated.enabled ? `Enabled: ${updated.frequency} at ${updated.time_of_day}` : "Disabled"})`,
    beforeData: current,
    afterData: updated,
  });

  res.json(updated);
}));

// Create real database backup file
router.post("/backups", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const label = req.body.label || "Manual Backup";
  const userId = req.user ? req.user.id : null;

  const backup = await backupService.createBackup(label, userId);

  await logAudit(req, {
    action: "create",
    module: "backups",
    tableName: "database_backups",
    recordId: backup.id,
    description: `Created database backup '${backup.filename}' (${(backup.file_size / 1024).toFixed(1)} KB) - ${label}`,
    afterData: backup,
  });

  res.status(201).json(backup);
}));

// Download backup SQL file
router.get("/backups/:id/download", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const fileInfo = await backupService.getBackupFile(req.params.id);
  if (!fileInfo || !fileInfo.exists) {
    throw new ApiError(404, "backup_file_not_found", "Backup file does not exist on disk.");
  }

  await logAudit(req, {
    action: "download",
    module: "backups",
    tableName: "database_backups",
    recordId: Number(req.params.id),
    description: `Downloaded database backup '${fileInfo.backup.filename}'`,
  });

  res.download(fileInfo.filePath, fileInfo.backup.filename);
}));

// Restore database from backup
router.post("/backups/:id/restore", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const result = await backupService.restoreBackup(req.params.id);

  await logAudit(req, {
    action: "restore",
    module: "backups",
    tableName: "database_backups",
    recordId: Number(req.params.id),
    description: `Restored full database from backup '${result.filename}'`,
  });

  res.json({ ok: true, message: `Database successfully restored from ${result.filename}` });
}));

// Delete backup record and physical file
router.delete("/backups/:id", BACKUP_ADMIN, asyncHandler(async (req, res) => {
  const fileInfo = await backupService.getBackupFile(req.params.id);
  const deleted = await backupService.deleteBackup(req.params.id);
  if (!deleted) throw new ApiError(404, "backup_not_found", "Backup record not found.");

  await logAudit(req, {
    action: "delete",
    module: "backups",
    tableName: "database_backups",
    recordId: Number(req.params.id),
    description: `Deleted database backup '${fileInfo?.backup?.filename || req.params.id}'`,
    beforeData: fileInfo?.backup || null,
  });

  res.json({ ok: true, id: req.params.id });
}));

module.exports = router;
