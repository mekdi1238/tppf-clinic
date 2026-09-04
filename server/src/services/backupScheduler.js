const { query } = require("../db/pool");
const logger = require("../utils/logger");
const backupService = require("./backupService");
const { logAudit } = require("./auditLogger");

let _intervalId = null;
let _isRunning = false;

/**
 * Computes next scheduled run timestamp.
 */
function calculateNextRun({ frequency = "daily", time_of_day = "02:00", day_of_week = 0 }, fromDate = new Date()) {
  const [hourStr, minStr] = (time_of_day || "02:00").split(":");
  const hour = parseInt(hourStr, 10) || 0;
  const minute = parseInt(minStr, 10) || 0;

  const next = new Date(fromDate);
  next.setSeconds(0, 0);

  if (frequency === "hourly") {
    next.setMinutes(0);
    next.setHours(next.getHours() + 1);
    return next;
  }

  next.setHours(hour, minute, 0, 0);

  if (frequency === "daily") {
    if (next <= fromDate) {
      next.setDate(next.getDate() + 1);
    }
    return next;
  }

  if (frequency === "weekly") {
    const targetDow = parseInt(day_of_week, 10) || 0;
    let daysUntil = (targetDow - next.getDay() + 7) % 7;
    if (daysUntil === 0 && next <= fromDate) {
      daysUntil = 7;
    }
    next.setDate(next.getDate() + daysUntil);
    return next;
  }

  if (frequency === "monthly") {
    next.setDate(1);
    if (next <= fromDate) {
      next.setMonth(next.getMonth() + 1);
      next.setDate(1);
    }
    return next;
  }

  // Fallback to daily
  if (next <= fromDate) {
    next.setDate(next.getDate() + 1);
  }
  return next;
}

/**
 * Gets the current backup schedule configuration.
 */
async function getSchedule() {
  const res = await query(`SELECT * FROM backup_schedule WHERE id = 1;`);
  if (!res.rows[0]) {
    const initRes = await query(`
      INSERT INTO backup_schedule (id, enabled, frequency, time_of_day, day_of_week, retention_count)
      VALUES (1, false, 'daily', '02:00', 0, 14)
      ON CONFLICT (id) DO UPDATE SET updated_at = now()
      RETURNING *;
    `);
    return initRes.rows[0];
  }
  return res.rows[0];
}

/**
 * Updates schedule configuration and recalculates next_run_at.
 */
async function updateSchedule({ enabled, frequency, time_of_day, day_of_week, retention_count }) {
  const current = await getSchedule();

  const isEnabled = enabled !== undefined ? Boolean(enabled) : current.enabled;
  const freq = frequency || current.frequency || "daily";
  const timeStr = time_of_day || current.time_of_day || "02:00";
  const dow = day_of_week !== undefined ? parseInt(day_of_week, 10) : current.day_of_week;
  const retention = retention_count !== undefined ? Math.max(1, parseInt(retention_count, 10) || 14) : current.retention_count;

  const nextRun = isEnabled ? calculateNextRun({ frequency: freq, time_of_day: timeStr, day_of_week: dow }) : null;

  const res = await query(
    `UPDATE backup_schedule
     SET enabled = $1,
         frequency = $2,
         time_of_day = $3,
         day_of_week = $4,
         retention_count = $5,
         next_run_at = $6,
         updated_at = now()
     WHERE id = 1
     RETURNING *;`,
    [isEnabled, freq, timeStr, dow, retention, nextRun]
  );

  logger.info(`Backup schedule updated: enabled=${isEnabled}, freq=${freq}, time=${timeStr}, nextRun=${nextRun ? nextRun.toISOString() : "none"}`);
  return res.rows[0];
}

/**
 * Enforces automatic backup retention limit by deleting oldest automatic backups.
 */
async function enforceRetention(retentionLimit) {
  if (!retentionLimit || retentionLimit <= 0) return;

  try {
    const autoBackups = await query(
      `SELECT * FROM database_backups
       WHERE notes LIKE 'Auto Backup%'
       ORDER BY created_at DESC;`
    );

    if (autoBackups.rows.length > retentionLimit) {
      const toDelete = autoBackups.rows.slice(retentionLimit);
      for (const b of toDelete) {
        logger.info(`Retention cleanup: removing old automatic backup #${b.id} (${b.filename})`);
        await backupService.deleteBackup(b.id);
      }
    }
  } catch (err) {
    logger.warn("Failed to enforce backup retention limit:", err);
  }
}

/**
 * Checks if a scheduled backup is due and executes it.
 */
async function checkAndRunScheduledBackup() {
  if (_isRunning) return;

  try {
    _isRunning = true;
    const schedule = await getSchedule();

    if (!schedule.enabled) return;

    const now = new Date();
    const nextRun = schedule.next_run_at ? new Date(schedule.next_run_at) : null;

    // If next_run_at has arrived or was never set
    if (!nextRun || now >= nextRun) {
      const label = `Auto Backup (${schedule.frequency.toUpperCase()} - ${schedule.time_of_day})`;
      logger.info(`Executing scheduled automatic backup: ${label}`);

      const backup = await backupService.createBackup(label, null);

      const computedNextRun = calculateNextRun(schedule, now);

      await query(
        `UPDATE backup_schedule
         SET last_run_at = now(),
             next_run_at = $1,
             updated_at = now()
         WHERE id = 1;`,
        [computedNextRun]
      );

      // Audit log the automated task
      await logAudit(null, {
        action: "create",
        module: "backups",
        tableName: "database_backups",
        recordId: backup.id,
        description: `Automated ${schedule.frequency} backup created: '${backup.filename}' (${(backup.file_size / 1024).toFixed(1)} KB)`,
        afterData: backup,
      });

      // Prune old automated backups according to retention count
      await enforceRetention(schedule.retention_count || 14);

      logger.info(`Scheduled backup finished. Next run scheduled for: ${computedNextRun.toISOString()}`);
    }
  } catch (err) {
    logger.error("Error during scheduled backup execution:", err);
  } finally {
    _isRunning = false;
  }
}

/**
 * Starts the background timer that polls schedule every 60 seconds.
 */
function startScheduler(pollIntervalMs = 60000) {
  if (_intervalId) clearInterval(_intervalId);

  // Initial check after 5 seconds
  setTimeout(checkAndRunScheduledBackup, 5000);

  _intervalId = setInterval(checkAndRunScheduledBackup, pollIntervalMs);
  logger.info(`Automatic backup scheduler service started (interval: ${pollIntervalMs / 1000}s)`);
}

function stopScheduler() {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
    logger.info("Automatic backup scheduler service stopped.");
  }
}

module.exports = {
  getSchedule,
  updateSchedule,
  checkAndRunScheduledBackup,
  calculateNextRun,
  startScheduler,
  stopScheduler,
};
