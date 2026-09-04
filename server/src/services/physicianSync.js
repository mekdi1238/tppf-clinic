const { query } = require('../db/pool');

async function syncPhysicians() {
  try {
    // 1. Sync Users with 'physician' role
    const usersWithPhysRole = await query(`
      SELECT u.id, u.full_name, u.physician_id
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id
      JOIN roles r ON r.id = ur.role_id
      WHERE r.name = 'physician';
    `);

    for (const u of usersWithPhysRole.rows) {
      if (!u.full_name) continue;

      let physId = u.physician_id;
      if (physId) {
        // Ensure physician row exists and name matches
        const existing = await query(`SELECT id FROM physicians WHERE id = $1;`, [physId]);
        if (existing.rows.length) {
          await query(`UPDATE physicians SET full_name = $1, is_active = true WHERE id = $2;`, [u.full_name, physId]);
        } else {
          physId = null;
        }
      }

      if (!physId) {
        // Check by full_name
        const byName = await query(`SELECT id FROM physicians WHERE LOWER(full_name) = LOWER($1);`, [u.full_name.trim()]);
        if (byName.rows.length) {
          physId = byName.rows[0].id;
          await query(`UPDATE physicians SET is_active = true WHERE id = $1;`, [physId]);
        } else {
          const inserted = await query(
            `INSERT INTO physicians (full_name, is_active) VALUES ($1, true) RETURNING id;`,
            [u.full_name.trim()]
          );
          physId = inserted.rows[0].id;
        }
        await query(`UPDATE users SET physician_id = $1 WHERE id = $2;`, [physId, u.id]);
      }
    }

    // 2. Deactivate physicians linked to users that were deleted or deactivated
    await query(`
      UPDATE physicians
      SET is_active = false
      WHERE id NOT IN (
        SELECT u.physician_id FROM users u WHERE u.physician_id IS NOT NULL AND u.is_active = true
      )
      AND LOWER(full_name) NOT IN (
        SELECT LOWER(u.full_name) FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        WHERE r.name = 'physician' AND u.is_active = true AND u.full_name IS NOT NULL
      )
      AND source_employee_registration_id IS NULL;
    `);

    // 3. Sync Patients registered with physician/clinic roles
    const medicalPhysPatients = await query(`
      SELECT id, full_name, gender
      FROM patients
      WHERE (LOWER(COALESCE(department, '')) = 'medical' OR LOWER(COALESCE(department, '')) = 'human resource management')
        AND (LOWER(COALESCE(position, '')) LIKE '%physician%' OR LOWER(COALESCE(position, '')) LIKE '%doctor%' OR LOWER(COALESCE(position, '')) LIKE '%clinic head%');
    `);

    for (const p of medicalPhysPatients.rows) {
      if (!p.full_name) continue;
      const byName = await query(`SELECT id FROM physicians WHERE LOWER(full_name) = LOWER($1);`, [p.full_name.trim()]);
      if (!byName.rows.length) {
        await query(
          `INSERT INTO physicians (full_name, gender, is_active) VALUES ($1, $2, true);`,
          [p.full_name.trim(), p.gender || null]
        );
      } else {
        await query(`UPDATE physicians SET is_active = true WHERE id = $1;`, [byName.rows[0].id]);
      }
    }

    // 4. Sync Employee Registrations with physician/clinic roles
    const medicalPhysRegs = await query(`
      SELECT id, full_name, gender
      FROM employee_registrations
      WHERE (LOWER(COALESCE(department, '')) = 'medical' OR LOWER(COALESCE(department, '')) = 'human resource management')
        AND (
          LOWER(COALESCE(position, '')) LIKE '%physician%' OR 
          LOWER(COALESCE(occupation, '')) LIKE '%physician%' OR
          LOWER(COALESCE(position, '')) LIKE '%doctor%' OR 
          LOWER(COALESCE(occupation, '')) LIKE '%doctor%' OR
          LOWER(COALESCE(position, '')) LIKE '%clinic head%' OR
          LOWER(COALESCE(occupation, '')) LIKE '%clinic head%'
        );
    `);

    for (const r of medicalPhysRegs.rows) {
      if (!r.full_name) continue;
      const bySrc = await query(`SELECT id FROM physicians WHERE source_employee_registration_id = $1;`, [r.id]);
      if (bySrc.rows.length) {
        await query(`UPDATE physicians SET full_name = $1, is_active = true WHERE id = $2;`, [r.full_name.trim(), bySrc.rows[0].id]);
      } else {
        const byName = await query(`SELECT id FROM physicians WHERE LOWER(full_name) = LOWER($1);`, [r.full_name.trim()]);
        if (!byName.rows.length) {
          await query(
            `INSERT INTO physicians (full_name, gender, is_active, source_employee_registration_id) VALUES ($1, $2, true, $3);`,
            [r.full_name.trim(), r.gender || null, r.id]
          );
        } else {
          await query(`UPDATE physicians SET source_employee_registration_id = $1, is_active = true WHERE id = $2;`, [r.id, byName.rows[0].id]);
        }
      }
    }
  } catch (err) {
    console.error('Error syncing physicians:', err);
  }
}

module.exports = { syncPhysicians };
