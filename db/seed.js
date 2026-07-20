const { Client } = require("pg");
const bcrypt = require("bcryptjs");
require("dotenv").config();

const ROLES = [
  ["receptionist", "Receptionist"],
  ["physician", "Physician"],
  ["lab_technician", "Lab Technician"],
  ["pharmacist", "Pharmacist"],
  ["hr_admin", "HR/Admin"],
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

    const adminPasswordHash = await bcrypt.hash("admin123", 10);
    const adminResult = await client.query(
      `INSERT INTO users (username, password_hash, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash
       RETURNING id;`,
      ["admin", adminPasswordHash, "System Administrator"]
    );
    const adminId = adminResult.rows[0].id;
    await client.query(
      `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING;`,
      [adminId, roleIds.system_administrator]
    );

    const physicianRows = [
      ["Dr. Selamawit Girma", "female", "2019-03-11", "ML-2201", "General Practitioner, MD"],
      ["Dr. Tesfaye Bekele", "male", "2016-08-02", "ML-1189", "Occupational Medicine, MD"],
      ["Dr. Hanna Alemu", "female", "2022-01-20", "ML-2477", "General Practitioner, MD"],
    ];
    const physicianIds = [];
    for (const [fullName, gender, dateRecruited, licenseNo, qualification] of physicianRows) {
      const result = await client.query(
        `INSERT INTO physicians (full_name, gender, date_recruited, license_no, qualification)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id;`,
        [fullName, gender, dateRecruited, licenseNo, qualification]
      );
      physicianIds.push(result.rows[0].id);
    }

    const patientRows = [
      ["Abebe Kassahun", "1990-04-12", "male", "Addis Ababa", "Bole, Woreda 03", "0911223344"],
      ["Yonas Tadesse", "1995-07-19", "male", "Adama", "Kebele 04, House 12", "0933445566"],
      ["Sara Mekonnen", "2001-01-27", "female", "Addis Ababa", "Lideta, Woreda 07", "0944556677"],
      ["Rahel Getachew", "1993-03-03", "female", "Addis Ababa", "Nifas Silk, Woreda 02", "0966778899"],
    ];
    const patientIds = [];
    for (const [fullName, dob, gender, location, address, phone] of patientRows) {
      const result = await client.query(
        `INSERT INTO patients (patient_code, full_name, date_of_birth, gender, location, address, phone)
         VALUES ('S' || lpad(nextval('patient_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6)
         RETURNING id;`,
        [fullName, dob, gender, location, address, phone]
      );
      if (result.rows[0]) patientIds.push(result.rows[0].id);
    }

    if (patientIds.length && physicianIds.length) {
      const visitRows = [
        [patientIds[0], physicianIds[0], "open", "Persistent headache for 3 days", "", null, null],
        [patientIds[1], physicianIds[1], "examined", "Follow-up on lower back pain", "Reduced tenderness, range of motion improved.", null, null],
        [patientIds[2], physicianIds[2], "diagnosed", "Fever and sore throat", "Throat inflamed, mild fever 38.1C on intake.", "Acute pharyngitis", null],
        [patientIds[3], physicianIds[0], "closed", "Routine occupational check-up", "No abnormal findings on physical exam.", "No significant findings", "discharged"],
      ];
      for (const [patientId, physicianId, status, chiefComplaint, notes, diagnosis, disposition] of visitRows) {
        await client.query(
          `INSERT INTO visits (patient_id, physician_id, status, chief_complaint, examination_notes, diagnosis, disposition)
           VALUES ($1, $2, $3, $4, $5, $6, $7);`,
          [patientId, physicianId, status, chiefComplaint, notes, diagnosis, disposition]
        );
      }
    }

    const registrationRows = [
      ["Biniam Alelegn", "1997-02-14", "male", "Addis Ababa", "Warehouse Assistant", "pending"],
      ["Genet Worku", "1994-06-09", "female", "Addis Ababa", "Machine Operator", "certified_fit"],
      ["Kalkidan Tesema", "1991-12-01", "male", "Adama", "Driver", "certified_unfit"],
      ["Samuel Girma", "1996-04-22", "male", "Addis Ababa", "Security Guard", "withdrawn"],
    ];
    const registrationIds = [];
    for (const [fullName, dob, gender, location, occupation, status] of registrationRows) {
      const result = await client.query(
        `INSERT INTO employee_registrations (registration_code, full_name, date_of_birth, gender, location, occupation, status)
         VALUES ('R' || lpad(nextval('registration_code_seq')::text, 3, '0'), $1, $2, $3, $4, $5, $6)
         RETURNING id;`,
        [fullName, dob, gender, location, occupation, status]
      );
      if (result.rows[0]) registrationIds.push(result.rows[0].id);
    }

    if (registrationIds.length >= 3 && physicianIds.length) {
      await client.query(
        `INSERT INTO medical_certifications
           (employee_registration_id, physician_id, examination_date, physical_examination, personal_hygiene,
            skin_disease, stool_exam_direct, syphilis, gonorrhea, other_findings, result)
         VALUES ($1, $2, now(), 'normal', 'good', 'none', 'negative', 'negative', 'negative',
                 'No abnormalities noted on general exam.', 'fit');`,
        [registrationIds[1], physicianIds[0]]
      );
      await client.query(
        `INSERT INTO medical_certifications
           (employee_registration_id, physician_id, examination_date, physical_examination, personal_hygiene,
            skin_disease, stool_exam_direct, syphilis, gonorrhea, other_findings, result, treatment_note)
         VALUES ($1, $2, now(), 'abnormal', 'fair', 'present', 'negative', 'negative', 'negative',
                 'Skin condition on both forearms requiring treatment before re-assessment.', 'unfit',
                 'Referred for dermatology follow-up; re-examine in 3 weeks.');`,
        [registrationIds[2], physicianIds[1]]
      );
    }

    console.log("Seed complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
