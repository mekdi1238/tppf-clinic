const { Client } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const ROLES = [
  ["receptionist", "Receptionist"],
  ["physician", "Physician"],
  ["lab_technician", "Lab Technician"],
  ["pharmacist", "Pharmacist"],
  ["hr_admin", "HR/Admin"],
  ["hr_reporting", "HR Reporting"],
  ["department_hr", "Department HR"],
  ["system_administrator", "System Administrator"],
];

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    // 1. Seed system roles
    const roleIds = {};
    for (const [name, displayName] of ROLES) {
      const result = await client.query(
        `INSERT INTO roles (name, display_name) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET display_name = EXCLUDED.display_name
         RETURNING id;`,
        [name, displayName]
      );
      roleIds[name] = result.rows[0].id;
    }

    // 2. Ensure initial administrator account exists
    const adminCheck = await client.query(`SELECT id FROM users WHERE username = 'admin';`);
    if (!adminCheck.rows.length) {
      const pwHash = await bcrypt.hash("admin123", 10);
      const userRes = await client.query(
        `INSERT INTO users (username, password_hash, full_name)
         VALUES ($1, $2, $3)
         RETURNING id;`,
        ["admin", pwHash, "System Administrator"]
      );
      const uid = userRes.rows[0].id;
      if (roleIds["system_administrator"]) {
        await client.query(
          `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING;`,
          [uid, roleIds["system_administrator"]]
        );
      }
      console.log("Created initial default 'admin' account.");
    }

    // 3. Seed lab test catalog
    const labTests = [
      ["WBC", "Hematology", "White Blood Cell Count"],
      ["HGB", "Hematology", "Hemoglobin"],
      ["PLT", "Hematology", "Platelet Count"],
      ["RBS", "Chemistry", "Random Blood Sugar"],
      ["FBS", "Chemistry", "Fasting Blood Sugar"],
      ["CREA", "Chemistry", "Creatinine"],
      ["HBSAG", "Serology", "Hepatitis B Surface Antigen"],
      ["VDRL", "Serology", "Syphilis Screening (VDRL)"],
      ["HIV", "Serology", "HIV Antibody Test"],
      ["URINE", "Urinalysis", "Routine Urinalysis"],
      ["STOOL", "Stool/Parasitology", "Stool Examination, Direct"],
    ];
    for (const [code, panel, displayName] of labTests) {
      await client.query(
        `INSERT INTO lab_test_catalog (code, panel, display_name)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET panel = EXCLUDED.panel, display_name = EXCLUDED.display_name;`,
        [code, panel, displayName]
      );
    }

    // 4. Seed clinic settings
    await client.query(
      `INSERT INTO clinic_settings (id, clinic_name, clinic_tagline, clinic_address, clinic_phone)
       VALUES (1, 'TPPF Clinic', 'Quality Healthcare & Occupational Services', 'Bole, Addis Ababa, Ethiopia', '+251 11 600 0000')
       ON CONFLICT (id) DO UPDATE SET
         clinic_name = EXCLUDED.clinic_name,
         clinic_tagline = EXCLUDED.clinic_tagline,
         clinic_address = EXCLUDED.clinic_address,
         clinic_phone = EXCLUDED.clinic_phone;`
    );

    console.log("Database initialized cleanly with zero dummy patient/candidate data.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
