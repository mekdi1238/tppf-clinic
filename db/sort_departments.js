/**
 * Standalone Department Sorter Script
 * Directly sorts registered staff into 'Production' and 'Technic'.
 *
 * Usage:
 *   node db/sort_departments.js
 */

require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('--- Starting Department Separation & Sorting ---');

  try {
    await client.query('BEGIN');

    // 1. Sort Production positions in employee_registrations
    const r1 = await client.query(`
      UPDATE employee_registrations
      SET department = 'Production'
      WHERE department IN ('Production and Technique', 'Production and Technic', 'Production & Technic', 'Production & Technique')
        AND (
          lower(coalesce(position, occupation, '')) LIKE '%production%'
          OR lower(coalesce(position, occupation, '')) LIKE '%machine operator%'
          OR lower(coalesce(position, occupation, '')) LIKE '%automobile%'
          OR lower(coalesce(position, occupation, '')) LIKE '%janitor coordinator%'
          OR lower(coalesce(position, occupation, '')) LIKE '%janitor co-ordinator%'
          OR lower(coalesce(position, occupation, '')) = 'janitor'
        );
    `);
    console.log(`✓ Updated ${r1.rowCount} employee registrations to 'Production'`);

    // 2. Sort all remaining positions in employee_registrations to Technic
    const r2 = await client.query(`
      UPDATE employee_registrations
      SET department = 'Technic'
      WHERE department IN ('Production and Technique', 'Production and Technic', 'Production & Technic', 'Production & Technique');
    `);
    console.log(`✓ Updated ${r2.rowCount} employee registrations to 'Technic'`);

    // 3. Sort Production positions in patients
    const r3 = await client.query(`
      UPDATE patients
      SET department = 'Production'
      WHERE department IN ('Production and Technique', 'Production and Technic', 'Production & Technic', 'Production & Technique')
        AND (
          lower(coalesce(position, '')) LIKE '%production%'
          OR lower(coalesce(position, '')) LIKE '%machine operator%'
          OR lower(coalesce(position, '')) LIKE '%automobile%'
          OR lower(coalesce(position, '')) LIKE '%janitor coordinator%'
          OR lower(coalesce(position, '')) LIKE '%janitor co-ordinator%'
          OR lower(coalesce(position, '')) = 'janitor'
        );
    `);
    console.log(`✓ Updated ${r3.rowCount} patients to 'Production'`);

    // 4. Sort all remaining positions in patients to Technic
    const r4 = await client.query(`
      UPDATE patients
      SET department = 'Technic'
      WHERE department IN ('Production and Technique', 'Production and Technic', 'Production & Technic', 'Production & Technique');
    `);
    console.log(`✓ Updated ${r4.rowCount} patients to 'Technic'`);

    // 5. Sort clinic_staff if table exists
    try {
      const r5a = await client.query(`
        UPDATE clinic_staff
        SET department = 'Production'
        WHERE department IN ('Production and Technique', 'Production and Technic', 'Production & Technic', 'Production & Technique')
          AND (
            lower(coalesce(position, '')) LIKE '%production%'
            OR lower(coalesce(position, '')) LIKE '%machine operator%'
            OR lower(coalesce(position, '')) LIKE '%automobile%'
            OR lower(coalesce(position, '')) LIKE '%janitor coordinator%'
            OR lower(coalesce(position, '')) LIKE '%janitor co-ordinator%'
            OR lower(coalesce(position, '')) = 'janitor'
          );
      `);
      const r5b = await client.query(`
        UPDATE clinic_staff
        SET department = 'Technic'
        WHERE department IN ('Production and Technique', 'Production and Technic', 'Production & Technic', 'Production & Technique');
      `);
      console.log(`✓ Updated clinic_staff records (${r5a.rowCount} Production, ${r5b.rowCount} Technic)`);
    } catch (e) {
      // ignore if table does not exist
    }

    // 6. Update users
    const r6 = await client.query(`
      UPDATE users
      SET department = 'Production'
      WHERE department IN ('Production and Technic', 'Production and Technique', 'Production & Technic', 'Production & Technique');
    `);
    console.log(`✓ Updated ${r6.rowCount} users with old department names`);

    // 7. Record migration in schema_migrations if table exists
    try {
      await client.query(`
        INSERT INTO schema_migrations (filename)
        VALUES ('0043_split_production_and_technic.sql')
        ON CONFLICT (filename) DO NOTHING;
      `);
    } catch (e) {
      // ignore
    }

    await client.query('COMMIT');
    console.log('\n--- Separation Complete! Current Database Status: ---');

    const pSummary = await client.query(`
      SELECT coalesce(department, 'Unassigned') AS department, count(*) AS count
      FROM patients
      GROUP BY department
      ORDER BY department;
    `);
    console.log('\nPatients by Department:');
    pSummary.rows.forEach(r => console.log(`  - ${r.department}: ${r.count}`));

    const erSummary = await client.query(`
      SELECT coalesce(department, 'Unassigned') AS department, count(*) AS count
      FROM employee_registrations
      GROUP BY department
      ORDER BY department;
    `);
    console.log('\nEmployee Registrations by Department:');
    erSummary.rows.forEach(r => console.log(`  - ${r.department}: ${r.count}`));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('FAILED — transaction rolled back:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
