const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { query, pool } = require("../db/pool");
const config = require("../config/env");
const logger = require("../utils/logger");

const BACKUPS_DIR = path.resolve(__dirname, "../../backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

/**
 * Parses connection details from DATABASE_URL.
 */
function parseDbUrl() {
  try {
    const parsed = new URL(config.databaseUrl);
    return {
      host: parsed.hostname || "localhost",
      port: parsed.port || "5432",
      user: decodeURIComponent(parsed.username || "postgres"),
      password: decodeURIComponent(parsed.password || ""),
      database: parsed.pathname.replace(/^\//, ""),
    };
  } catch (e) {
    return {
      host: "localhost",
      port: "5432",
      user: "postgres",
      password: "",
      database: "tppf_clinic",
    };
  }
}

/**
 * Formats a SQL value safely for INSERT statements.
 */
function sqlEscape(val) {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return isFinite(val) ? String(val) : "NULL";
  if (val instanceof Date) return `'${val.toISOString()}'::timestamptz`;
  if (typeof val === "object") {
    const jsonStr = JSON.stringify(val).replace(/'/g, "''");
    return `'${jsonStr}'::jsonb`;
  }
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

/**
 * Built-in zero-dependency SQL backup generator.
 * Dumps all table schemas, data, and sequence resets in a transaction.
 */
async function generateInternalSqlDump(label) {
  const client = await pool.connect();
  try {
    const tablesRes = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT IN ('database_backups')
      ORDER BY table_name;
    `);

    const tableNames = tablesRes.rows.map(r => r.table_name);

    // Desired insertion order to respect foreign key constraints
    const priorityOrder = [
      "schema_migrations",
      "roles",
      "users",
      "user_roles",
      "patients",
      "physicians",
      "visits",
      "vitals",
      "admissions",
      "admission_notes",
      "lab_test_catalog",
      "lab_orders",
      "lab_order_items",
      "drugs",
      "drug_stock",
      "prescriptions",
      "prescription_items",
      "dispensing_records",
      "referrals",
      "sick_leaves",
      "employee_registrations",
      "medical_certifications",
      "settings",
      "audit_log"
    ];

    const sortedTables = [];
    for (const p of priorityOrder) {
      if (tableNames.includes(p)) sortedTables.push(p);
    }
    for (const t of tableNames) {
      if (!sortedTables.includes(t)) sortedTables.push(t);
    }

    let sql = `-- =========================================================\n`;
    sql += `-- TPPF Clinic Management System - Full Database Backup\n`;
    sql += `-- Label: ${label || "Manual Backup"}\n`;
    sql += `-- Date : ${new Date().toISOString()}\n`;
    sql += `-- Host : ${parseDbUrl().host}\n`;
    sql += `-- =========================================================\n\n`;
    sql += `BEGIN;\n\n`;

    // Disable triggers / constraints during restore
    sql += `SET CONSTRAINTS ALL DEFERRED;\n\n`;

    // 1. Truncate tables in reverse order
    sql += `-- 1. Clean existing records\n`;
    for (let i = sortedTables.length - 1; i >= 0; i--) {
      sql += `TRUNCATE TABLE "${sortedTables[i]}" CASCADE;\n`;
    }
    sql += `\n-- 2. Populate table data\n`;

    // 2. Dump data for each table
    for (const tableName of sortedTables) {
      const dataRes = await client.query(`SELECT * FROM "${tableName}";`);
      const rows = dataRes.rows;

      sql += `\n-- Table: ${tableName} (${rows.length} rows)\n`;
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const quotedCols = columns.map(c => `"${c}"`).join(", ");

      const batchSize = 100;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const valuesList = batch.map(row => {
          const vals = columns.map(col => sqlEscape(row[col]));
          return `(${vals.join(", ")})`;
        });

        sql += `INSERT INTO "${tableName}" (${quotedCols})\nVALUES\n  ${valuesList.join(",\n  ")};\n`;
      }
    }

    // 3. Reset all auto-incrementing serial sequences
    sql += `\n-- 3. Reset Sequences\n`;
    for (const tableName of sortedTables) {
      sql += `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = 'id') THEN
    PERFORM setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1));
  END IF;
END $$;\n`;
    }

    sql += `\nCOMMIT;\n`;
    return sql;
  } finally {
    client.release();
  }
}

/**
 * Creates a real database backup file on disk and registers it in database_backups.
 */
async function createBackup(label = "Manual Backup", userId = null) {
  ensureBackupDir();

  const now = new Date();
  const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `tppf_clinic_backup_${dateStr}.sql`;
  const filePath = path.join(BACKUPS_DIR, filename);

  const dbInfo = parseDbUrl();

  let dumpSuccess = false;

  // Attempt pg_dump first if available
  const pgDumpCmd = `pg_dump -h "${dbInfo.host}" -p "${dbInfo.port}" -U "${dbInfo.user}" -d "${dbInfo.database}" --no-owner --no-privileges -f "${filePath}"`;

  try {
    await new Promise((resolve, reject) => {
      exec(pgDumpCmd, { env: { ...process.env, PGPASSWORD: dbInfo.password } }, (err, stdout, stderr) => {
        if (err || (fs.existsSync(filePath) && fs.statSync(filePath).size === 0)) {
          reject(err || new Error("pg_dump generated empty file"));
        } else {
          resolve(stdout);
        }
      });
    });
    dumpSuccess = true;
    logger.info(`Database backup created via pg_dump: ${filename}`);
  } catch (pgDumpErr) {
    logger.info(`pg_dump not available or failed (${pgDumpErr.message}). Using native SQL backup engine.`);
    const sqlContent = await generateInternalSqlDump(label);
    fs.writeFileSync(filePath, sqlContent, "utf8");
    dumpSuccess = true;
    logger.info(`Database backup created via internal engine: ${filename}`);
  }

  const fileStats = fs.statSync(filePath);
  const fileSize = fileStats.size;

  const result = await query(
    `INSERT INTO database_backups (filename, file_size, created_by, notes)
     VALUES ($1, $2, $3, $4)
     RETURNING *;`,
    [filename, fileSize, userId, label]
  );

  return {
    ...result.rows[0],
    filePath,
  };
}

/**
 * Retrieves physical backup file path and metadata.
 */
async function getBackupFile(id) {
  const res = await query(`SELECT * FROM database_backups WHERE id = $1;`, [id]);
  const backup = res.rows[0];
  if (!backup) return null;

  ensureBackupDir();
  const filePath = path.join(BACKUPS_DIR, backup.filename);
  return {
    backup,
    filePath,
    exists: fs.existsSync(filePath),
  };
}

/**
 * Deletes backup record and removes file from disk.
 */
async function deleteBackup(id) {
  const fileInfo = await getBackupFile(id);
  if (fileInfo && fileInfo.exists) {
    try {
      fs.unlinkSync(fileInfo.filePath);
    } catch (e) {
      logger.warn(`Could not delete backup file ${fileInfo.filePath}:`, e);
    }
  }
  const result = await query(`DELETE FROM database_backups WHERE id = $1 RETURNING id;`, [id]);
  return result.rows[0];
}

/**
 * Restores database from a backup SQL file.
 */
async function restoreBackup(id) {
  const fileInfo = await getBackupFile(id);
  if (!fileInfo || !fileInfo.exists) {
    throw new Error("Backup file not found on disk.");
  }

  const sql = fs.readFileSync(fileInfo.filePath, "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    logger.info(`Successfully restored database from backup ID #${id} (${fileInfo.backup.filename})`);
    return { success: true, filename: fileInfo.backup.filename };
  } finally {
    client.release();
  }
}

module.exports = {
  createBackup,
  getBackupFile,
  deleteBackup,
  restoreBackup,
};
