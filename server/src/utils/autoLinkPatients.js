const { query } = require("../db/pool");

async function autoLinkPatients() {
  const unlinked = await query("SELECT * FROM patients WHERE source_employee_registration_id IS NULL;");
  if (unlinked.rows.length === 0) return;

  console.log(`Auto-linking ${unlinked.rows.length} patients to employee registrations...`);
  for (const p of unlinked.rows) {
    const regSql = `
      INSERT INTO employee_registrations
        (registration_code, full_name, date_of_birth, gender, location, occupation, photo_url, status, department, position)
      VALUES
        ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6, 'accepted_as_staff', $7, $8)
      RETURNING id;
    `;
    const regRes = await query(regSql, [
      p.full_name,
      p.date_of_birth || null,
      p.gender || null,
      p.location || '',
      p.position || 'Staff',
      p.photo_url || null,
      p.department || 'General',
      p.position || 'Staff'
    ]);
    const regId = regRes.rows[0].id;
    await query("UPDATE patients SET source_employee_registration_id = $1 WHERE id = $2;", [regId, p.id]);
  }
  console.log("Successfully auto-linked all legacy patients!");
}

module.exports = autoLinkPatients;

if (require.main === module) {
  autoLinkPatients().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
