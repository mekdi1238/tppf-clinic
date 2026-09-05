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

// Desired insertion order to respect foreign key constraints
const PRIORITY_ORDER = [
  "schema_migrations",
  "roles",
  "departments",
  "department_positions",
  "employee_registrations",
  "physicians",
  "users",
  "user_roles",
  "user_permissions",
  "patients",
  "clinic_staff",
  "drugs",
  "drug_stock",
  "lab_test_catalog",
  "visits",
  "vitals",
  "admissions",
  "admission_notes",
  "lab_orders",
  "lab_order_items",
  "prescriptions",
  "prescription_items",
  "dispensing_records",
  "referrals",
  "sick_leaves",
  "medical_certifications",
  "settings",
  "clinic_settings",
  "backup_schedule",
  "attachments",
  "audit_log",
];

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

    const sortedTables = [];
    for (const p of PRIORITY_ORDER) {
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

        sql += `INSERT INTO "${tableName}" (${quotedCols}) OVERRIDING SYSTEM VALUE\nVALUES\n  ${valuesList.join(",\n  ")};\n`;
      }
    }

    // 3. Reset all auto-incrementing serial and code sequences
    sql += `\n-- 3. Reset Sequences\n`;
    for (const tableName of sortedTables) {
      sql += `DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name = 'id') THEN
    PERFORM setval(pg_get_serial_sequence('${tableName}', 'id'), COALESCE((SELECT MAX(id) FROM "${tableName}"), 1));
  END IF;
END $$;\n`;
    }

    sql += `DO $$
DECLARE
  max_p integer;
  max_r integer;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'patient_code_seq') THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(patient_code, '\\D', '', 'g'), '')::integer), 1) INTO max_p FROM patients;
    PERFORM setval('patient_code_seq', max_p);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'registration_code_seq') THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(registration_code, '\\D', '', 'g'), '')::integer), 1) INTO max_r FROM employee_registrations;
    PERFORM setval('registration_code_seq', max_r);
  END IF;
END $$;\n`;

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
 * Sanitizes and reorders SQL for restoration, ensuring:
 * 1. OVERRIDING SYSTEM VALUE is present on all INSERT INTO statements (for PostgreSQL IDENTITY columns).
 * 2. Tables are executed in correct topological foreign key dependency order even for backups created before this fix.
 */
function sanitizeAndReorderBackupSql(rawSql) {
  // 1. Ensure OVERRIDING SYSTEM VALUE on all INSERTs
  let sql = rawSql.replace(
    /INSERT INTO\s+("[^"]+"|\w+)\s*\(([\s\S]*?)\)\s*(?!OVERRIDING\s+(?:SYSTEM|USER)\s+VALUE)\s*VALUES/gi,
    'INSERT INTO $1 ($2) OVERRIDING SYSTEM VALUE\nVALUES'
  );

  // 2. Parse table blocks if generated by internal dump engine
  const headerIdx = sql.indexOf('-- 2. Populate table data');
  const seqIdx = sql.indexOf('-- 3. Reset Sequences');

  if (headerIdx === -1 || seqIdx === -1) {
    return sql;
  }

  const beforeData = sql.slice(0, headerIdx + '-- 2. Populate table data'.length);
  const dataSection = sql.slice(headerIdx + '-- 2. Populate table data'.length, seqIdx);
  const afterData = sql.slice(seqIdx);

  // Extract table blocks
  const tableBlocks = {};
  const blockRegex = /-- Table:\s*(\w+)[^\n]*\n([\s\S]*?)(?=(?:-- Table:|$))/g;
  let match;
  while ((match = blockRegex.exec(dataSection)) !== null) {
    const tableName = match[1];
    tableBlocks[tableName] = match[0];
  }

  // Reassemble data section in PRIORITY_ORDER
  let reorderedData = '\n\n';
  const processedTables = new Set();

  for (const tableName of PRIORITY_ORDER) {
    if (tableBlocks[tableName]) {
      reorderedData += tableBlocks[tableName].trim() + '\n\n';
      processedTables.add(tableName);
    }
  }

  for (const [tableName, block] of Object.entries(tableBlocks)) {
    if (!processedTables.has(tableName)) {
      reorderedData += block.trim() + '\n\n';
    }
  }

  return beforeData + reorderedData + afterData;
}

/**
 * Scans BACKUPS_DIR for .sql files and ensures each is registered in database_backups.
 */
async function syncBackupsFromDisk(clientOrPool = null) {
  ensureBackupDir();
  const db = clientOrPool || pool;

  const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith(".sql"));
  for (const file of files) {
    const fullPath = path.join(BACKUPS_DIR, file);
    if (!fs.existsSync(fullPath)) continue;

    const stat = fs.statSync(fullPath);
    let label = "Manual Backup";
    let createdAt = stat.mtime;

    try {
      const fd = fs.openSync(fullPath, "r");
      const buffer = Buffer.alloc(1024);
      const bytesRead = fs.readSync(fd, buffer, 0, 1024, 0);
      fs.closeSync(fd);
      const content = buffer.toString("utf8", 0, bytesRead);

      const labelMatch = content.match(/-- Label:\s*([^\n]+)/);
      const dateMatch = content.match(/-- Date\s*:\s*([^\n]+)/);
      if (labelMatch) label = labelMatch[1].trim();
      if (dateMatch) {
        const parsedDate = new Date(dateMatch[1].trim());
        if (!isNaN(parsedDate.getTime())) createdAt = parsedDate;
      }
    } catch (_) {}

    const existing = await db.query(
      `SELECT id FROM database_backups WHERE filename = $1;`,
      [file]
    );

    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO database_backups (filename, file_size, created_at, notes)
         VALUES ($1, $2, $3, $4);`,
        [file, stat.size, createdAt, label]
      );
    }
  }
}

/**
 * Restores database from a backup SQL file.
 */
async function restoreBackup(id) {
  const fileInfo = await getBackupFile(id);
  if (!fileInfo || !fileInfo.exists) {
    throw new Error("Backup file not found on disk.");
  }

  const rawSql = fs.readFileSync(fileInfo.filePath, "utf8");
  const sql = sanitizeAndReorderBackupSql(rawSql);

  const client = await pool.connect();
  let preservedBackups = [];
  try {
    const bRes = await client.query(`SELECT id, filename, file_size, created_at, created_by, notes FROM database_backups;`);
    preservedBackups = bRes.rows;
  } catch (_) {}

  try {
    await client.query(sql);

    // Re-insert preserved backup records so backup list isn't wiped out by TRUNCATE CASCADE
    if (preservedBackups.length > 0) {
      for (const b of preservedBackups) {
        await client.query(
          `INSERT INTO database_backups (id, filename, file_size, created_at, created_by, notes)
           OVERRIDING SYSTEM VALUE
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO UPDATE SET
             filename = EXCLUDED.filename,
             file_size = EXCLUDED.file_size,
             created_at = EXCLUDED.created_at,
             created_by = EXCLUDED.created_by,
             notes = EXCLUDED.notes;`,
          [b.id, b.filename, b.file_size, b.created_at, b.created_by, b.notes]
        ).catch(() => {});
      }
      await client.query(`
        SELECT setval(pg_get_serial_sequence('database_backups', 'id'), COALESCE((SELECT MAX(id) FROM database_backups), 1));
      `).catch(() => {});
    }

    // Also sync any disk backup files into database_backups
    await syncBackupsFromDisk(client).catch(() => {});

    logger.info(`Successfully restored database from backup ID #${id} (${fileInfo.backup.filename})`);
    return { success: true, filename: fileInfo.backup.filename };
  } catch (err) {
    try {
      await client.query("ROLLBACK;");
    } catch (_) {}
    client.release(true); // destroy client so aborted transaction doesn't poison pool
    throw err;
  } finally {
    try {
      client.release();
    } catch (_) {}
  }
}

/**
 * Imports an external SQL backup file either from uploaded content or a direct server file path.
 * Optionally restores it immediately.
 */
async function importBackup({ filename, sql, filePath, label, restoreImmediately, userId }) {
  ensureBackupDir();

  let sqlContent = "";
  let originalFilename = filename;

  if (filePath && filePath.trim()) {
    const resolvedPath = path.resolve(filePath.trim());
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Backup file not found at path: ${filePath}`);
    }
    sqlContent = fs.readFileSync(resolvedPath, "utf8");
    if (!originalFilename) {
      originalFilename = path.basename(resolvedPath);
    }
  } else if (sql && typeof sql === "string") {
    sqlContent = sql;
  } else {
    throw new Error("Please choose a backup file to upload or provide a valid server file path.");
  }

  if (!sqlContent || !sqlContent.trim()) {
    throw new Error("The selected backup file is empty.");
  }

  // Create clean target filename in BACKUPS_DIR
  const rawBase = (originalFilename || "imported_backup.sql").replace(/[^a-zA-Z0-9._-]/g, "_");
  const datePrefix = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const targetFilename = rawBase.startsWith("tppf_clinic_backup_")
    ? rawBase
    : `tppf_clinic_backup_${datePrefix}_${rawBase}`;
  const targetPath = path.join(BACKUPS_DIR, targetFilename);

  // Write file to backups directory if not already there
  fs.writeFileSync(targetPath, sqlContent, "utf8");

  const stat = fs.statSync(targetPath);
  const notes = label && label.trim() ? label.trim() : `Manual Import: ${rawBase}`;

  // Check if this filename is already registered
  let backupRecord;
  const existing = await query(`SELECT * FROM database_backups WHERE filename = $1;`, [targetFilename]);
  if (existing.rows.length > 0) {
    backupRecord = existing.rows[0];
  } else {
    const insertRes = await query(
      `INSERT INTO database_backups (filename, file_size, created_by, notes)
       VALUES ($1, $2, $3, $4)
       RETURNING *;`,
      [targetFilename, stat.size, userId, notes]
    );
    backupRecord = insertRes.rows[0];
  }

  let restoreResult = null;
  if (restoreImmediately) {
    restoreResult = await restoreBackup(backupRecord.id);
  }

  return {
    backup: backupRecord,
    restored: Boolean(restoreImmediately),
    restoreResult,
  };
}

module.exports = {
  createBackup,
  getBackupFile,
  deleteBackup,
  restoreBackup,
  syncBackupsFromDisk,
  importBackup,
};
