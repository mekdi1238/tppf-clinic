/* ===========================================================
   TPPF Clinic — Mock API layer
   -----------------------------------------------------------
   This simulates the real backend described in the entity
   dictionary (users, physicians, patients, visits...).

   SWAP-IN POINT: once the real backend exists, set USE_MOCK to
   false and point API_BASE at it. Every function below keeps
   the same signature and return shape either way, so no calling
   code (dashboard.js, patients.js, visits.js...) needs to change.
   =========================================================== */

const API_BASE = '/api/v1';   // future real backend base URL
const USE_MOCK = false;
const MOCK_ONLY_PATHS = [];
const MOCK_DELAY = 320;       // ms, simulates network latency
const DB_KEY = 'tppf_mock_db_v1';

// ---------- tiny helpers ----------
const delay = (ms = MOCK_DELAY) => new Promise((res) => setTimeout(res, ms));
const uid = (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
const nowIso = () => new Date().toISOString();

function pad(n, len = 2) { return String(n).padStart(len, '0'); }

// ---------- seed data ----------
function buildSeed() {
  const physicians = [
    { id: 'phy_1', full_name: 'Dr. Selamawit Girma', gender: 'female', date_recruited: '2019-03-11', license_no: 'ML-2201', qualification: 'General Practitioner, MD', is_active: true },
    { id: 'phy_2', full_name: 'Dr. Tesfaye Bekele', gender: 'male', date_recruited: '2016-08-02', license_no: 'ML-1189', qualification: 'Occupational Medicine, MD', is_active: true },
    { id: 'phy_3', full_name: 'Dr. Hanna Alemu', gender: 'female', date_recruited: '2022-01-20', license_no: 'ML-2477', qualification: 'General Practitioner, MD', is_active: true },
  ];

  const patients = [
    { id: 'pat_1', patient_code: 'S001', full_name: 'Abebe Kassahun', date_of_birth: '1990-04-12', gender: 'male', location: 'Addis Ababa', address: 'Bole, Woreda 03', phone: '0911223344', source_employee_registration_id: null, registered_date: '2024-02-10T08:30:00Z', is_active: true },
    { id: 'pat_2', patient_code: 'S002', full_name: 'Marta Lemma', date_of_birth: '1988-11-02', gender: 'female', location: 'Addis Ababa', address: 'Kirkos, Kebele 11', phone: '0922334455', source_employee_registration_id: 'reg_9', registered_date: '2024-03-05T09:10:00Z', is_active: true },
    { id: 'pat_3', patient_code: 'S003', full_name: 'Yonas Tadesse', date_of_birth: '1995-07-19', gender: 'male', location: 'Adama', address: 'Kebele 04, House 12', phone: '0933445566', source_employee_registration_id: null, registered_date: '2024-05-18T10:05:00Z', is_active: true },
    { id: 'pat_4', patient_code: 'S004', full_name: 'Sara Mekonnen', date_of_birth: '2001-01-27', gender: 'female', location: 'Addis Ababa', address: 'Lideta, Woreda 07', phone: '0944556677', source_employee_registration_id: null, registered_date: '2024-06-22T13:40:00Z', is_active: true },
    { id: 'pat_5', patient_code: 'S005', full_name: 'Dawit Fikru', gender: 'male', date_of_birth: '1979-09-30', location: 'Addis Ababa', address: 'Yeka, Kebele 09', phone: '0955667788', source_employee_registration_id: null, registered_date: '2024-07-01T08:15:00Z', is_active: false },
    { id: 'pat_6', patient_code: 'S006', full_name: 'Rahel Getachew', date_of_birth: '1993-03-03', gender: 'female', location: 'Addis Ababa', address: 'Nifas Silk, Woreda 02', phone: '0966778899', source_employee_registration_id: null, registered_date: '2024-08-14T11:20:00Z', is_active: true },
  ];

  const today = new Date();
  const iso = (daysAgo, h = 9, m = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };

  const visits = [
    { id: 'vis_1', patient_id: 'pat_1', physician_id: 'phy_1', visit_date: iso(0, 9, 15), status: 'open', chief_complaint: 'Persistent headache for 3 days', examination_notes: '', diagnosis: null, disposition: null },
    { id: 'vis_2', patient_id: 'pat_3', physician_id: 'phy_2', visit_date: iso(0, 10, 5), status: 'examined', chief_complaint: 'Follow-up on lower back pain', examination_notes: 'Reduced tenderness compared to last visit. Range of motion improved.', diagnosis: null, disposition: null },
    { id: 'vis_3', patient_id: 'pat_4', physician_id: 'phy_3', visit_date: iso(1, 14, 0), status: 'diagnosed', chief_complaint: 'Fever and sore throat', examination_notes: 'Throat inflamed, mild fever 38.1C on intake.', diagnosis: 'Acute pharyngitis', disposition: null },
    { id: 'vis_4', patient_id: 'pat_2', physician_id: 'phy_1', visit_date: iso(2, 8, 45), status: 'closed', chief_complaint: 'Routine occupational check-up', examination_notes: 'No abnormal findings on physical exam.', diagnosis: 'No significant findings', disposition: 'discharged' },
    { id: 'vis_5', patient_id: 'pat_6', physician_id: 'phy_2', visit_date: iso(3, 11, 30), status: 'closed', chief_complaint: 'Minor laceration, left hand', examination_notes: 'Wound cleaned and dressed. No signs of infection.', diagnosis: 'Superficial laceration', disposition: 'discharged' },
    { id: 'vis_6', patient_id: 'pat_1', physician_id: 'phy_3', visit_date: iso(4, 9, 0), status: 'closed', chief_complaint: 'Recurrent cough', examination_notes: 'Chest clear on auscultation.', diagnosis: 'Upper respiratory tract infection', disposition: 'discharged' },
    { id: 'vis_7', patient_id: 'pat_3', physician_id: 'phy_1', visit_date: iso(5, 13, 15), status: 'closed', chief_complaint: 'Ankle sprain', examination_notes: 'Mild swelling, full weight bearing possible.', diagnosis: 'Grade 1 ankle sprain', disposition: 'referred' },
    { id: 'vis_8', patient_id: 'pat_4', physician_id: 'phy_2', visit_date: iso(6, 10, 40), status: 'closed', chief_complaint: 'Skin rash', examination_notes: 'Localized rash on forearm, no systemic symptoms.', diagnosis: 'Contact dermatitis', disposition: 'discharged' },
    { id: 'vis_9', patient_id: 'pat_6', physician_id: 'phy_3', visit_date: iso(0, 8, 0), status: 'diagnosed', chief_complaint: 'Severe abdominal pain and dehydration', examination_notes: 'Guarding on palpation, unable to tolerate oral fluids.', diagnosis: 'Suspected acute gastroenteritis with dehydration', disposition: 'admitted' },
  ];

  const registrations = [
    { id: 'reg_1', registration_code: 'R001', full_name: 'Biniam Alelegn', date_of_birth: '1997-02-14', gender: 'male', location: 'Addis Ababa', occupation: 'Warehouse Assistant', registration_date: iso(3, 8, 30), status: 'pending' },
    { id: 'reg_2', registration_code: 'R002', full_name: 'Genet Worku', date_of_birth: '1994-06-09', gender: 'female', location: 'Addis Ababa', occupation: 'Machine Operator', registration_date: iso(6, 9, 0), status: 'certified_fit' },
    { id: 'reg_3', registration_code: 'R003', full_name: 'Kalkidan Tesema', date_of_birth: '1991-12-01', gender: 'male', location: 'Adama', occupation: 'Driver', registration_date: iso(8, 10, 15), status: 'certified_unfit' },
    { id: 'reg_9', registration_code: 'R004', full_name: 'Marta Lemma', date_of_birth: '1988-11-02', gender: 'female', location: 'Addis Ababa', occupation: 'Administrative Assistant', registration_date: '2024-02-28T09:00:00Z', status: 'hired' },
    { id: 'reg_5', registration_code: 'R005', full_name: 'Samuel Girma', date_of_birth: '1996-04-22', gender: 'male', location: 'Addis Ababa', occupation: 'Security Guard', registration_date: iso(12, 8, 45), status: 'withdrawn' },
  ];

  const certifications = [
    {
      id: 'cert_1', employee_registration_id: 'reg_2', physician_id: 'phy_1', examination_date: iso(5, 10, 0),
      physical_examination: 'normal', personal_hygiene: 'good', skin_disease: 'none', stool_exam_direct: 'negative',
      syphilis: 'negative', gonorrhea: 'negative', other_findings: 'No abnormalities noted on general exam.',
      result: 'fit', treatment_note: '', treatment_result_note: '',
    },
    {
      id: 'cert_2', employee_registration_id: 'reg_3', physician_id: 'phy_2', examination_date: iso(7, 11, 30),
      physical_examination: 'abnormal', personal_hygiene: 'fair', skin_disease: 'present', stool_exam_direct: 'negative',
      syphilis: 'negative', gonorrhea: 'negative', other_findings: 'Skin condition on both forearms requiring treatment before re-assessment.',
      result: 'unfit', treatment_note: 'Referred for dermatology follow-up; re-examine in 3 weeks.', treatment_result_note: '',
    },
    {
      id: 'cert_3', employee_registration_id: 'reg_9', physician_id: 'phy_3', examination_date: '2024-02-27T09:30:00Z',
      physical_examination: 'normal', personal_hygiene: 'good', skin_disease: 'none', stool_exam_direct: 'negative',
      syphilis: 'negative', gonorrhea: 'negative', other_findings: 'Cleared for administrative role.',
      result: 'fit', treatment_note: '', treatment_result_note: '',
    },
  ];

  const lab_test_catalog = [
    { id: 'test_wbc', code: 'WBC', panel: 'Hematology', display_name: 'White Blood Cell Count' },
    { id: 'test_hgb', code: 'HGB', panel: 'Hematology', display_name: 'Hemoglobin' },
    { id: 'test_plt', code: 'PLT', panel: 'Hematology', display_name: 'Platelet Count' },
    { id: 'test_rbs', code: 'RBS', panel: 'Chemistry', display_name: 'Random Blood Sugar' },
    { id: 'test_fbs', code: 'FBS', panel: 'Chemistry', display_name: 'Fasting Blood Sugar' },
    { id: 'test_crea', code: 'CREA', panel: 'Chemistry', display_name: 'Creatinine' },
    { id: 'test_hba1c', code: 'HBA1C', panel: 'Chemistry', display_name: 'HbA1c (Glycated Hemoglobin)', normal_range: '5.7 - 6.4%' },
    { id: 'test_so', code: 'SO', panel: 'Hematology', display_name: "SO (Salmonella 'O' Antigen)" },
    { id: 'test_sh', code: 'SH', panel: 'Hematology', display_name: "SH (Salmonella 'H' Antigen)" },
    { id: 'test_ox19', code: 'Ox19', panel: 'Hematology', display_name: 'Ox19 (Proteus OX19 Antigen)' },
    { id: 'test_hbsag', code: 'HBSAG', panel: 'Serology', display_name: 'Hepatitis B Surface Antigen' },
    { id: 'test_vdrl', code: 'VDRL', panel: 'Serology', display_name: 'Syphilis Screening (VDRL)' },
    { id: 'test_hiv', code: 'HIV', panel: 'Serology', display_name: 'HIV Antibody Test' },
    { id: 'test_urine', code: 'URINE', panel: 'Urinalysis', display_name: 'Routine Urinalysis' },
    { id: 'test_stool', code: 'STOOL', panel: 'Stool/Parasitology', display_name: 'Stool Examination, Direct' },
  ];

  const drugs = [
    { id: 'drug_paracetamol', name: 'Paracetamol 500mg', unit: 'tablet', description: 'Analgesic / antipyretic' },
    { id: 'drug_amoxicillin', name: 'Amoxicillin 500mg', unit: 'capsule', description: 'Antibiotic' },
    { id: 'drug_ibuprofen', name: 'Ibuprofen 400mg', unit: 'tablet', description: 'NSAID' },
    { id: 'drug_ors', name: 'Oral Rehydration Salts', unit: 'sachet', description: 'Rehydration therapy' },
    { id: 'drug_metronidazole', name: 'Metronidazole 400mg', unit: 'tablet', description: 'Antibiotic / antiparasitic' },
    { id: 'drug_diclofenac_gel', name: 'Diclofenac Gel', unit: 'tube', description: 'Topical NSAID' },
    { id: 'drug_ciprofloxacin', name: 'Ciprofloxacin 500mg', unit: 'tablet', description: 'Antibiotic' },
    { id: 'drug_vitc', name: 'Vitamin C 500mg', unit: 'tablet', description: 'Supplement' },
  ];

  const drug_stock = [
    { drug_id: 'drug_paracetamol', quantity_on_hand: 420, reorder_threshold: 100 },
    { drug_id: 'drug_amoxicillin', quantity_on_hand: 38, reorder_threshold: 50 },
    { drug_id: 'drug_ibuprofen', quantity_on_hand: 180, reorder_threshold: 60 },
    { drug_id: 'drug_ors', quantity_on_hand: 90, reorder_threshold: 30 },
    { drug_id: 'drug_metronidazole', quantity_on_hand: 12, reorder_threshold: 40 },
    { drug_id: 'drug_diclofenac_gel', quantity_on_hand: 25, reorder_threshold: 10 },
    { drug_id: 'drug_ciprofloxacin', quantity_on_hand: 64, reorder_threshold: 40 },
    { drug_id: 'drug_vitc', quantity_on_hand: 300, reorder_threshold: 50 },
  ];

  const roles = [
    { id: 'role_receptionist', name: 'receptionist', display_name: 'Receptionist' },
    { id: 'role_physician', name: 'physician', display_name: 'Physician' },
    { id: 'role_lab_technician', name: 'lab_technician', display_name: 'Lab Technician' },
    { id: 'role_pharmacist', name: 'pharmacist', display_name: 'Pharmacist' },
    { id: 'role_hr_admin', name: 'hr_admin', display_name: 'HR/Admin' },
    { id: 'role_system_administrator', name: 'system_administrator', display_name: 'System Administrator' },
  ];

  const users = [
    { id: 'usr_1', username: 'admin', password: 'admin123', full_name: 'System Administrator', physician_id: null, is_active: true, role_ids: ['role_system_administrator'], last_login_at: null, created_at: nowIso() },
    { id: 'usr_2', username: 'selam.girma', password: 'clinic123', full_name: 'Dr. Selamawit Girma', physician_id: 'phy_1', is_active: true, role_ids: ['role_physician'], last_login_at: null, created_at: nowIso() },
    { id: 'usr_3', username: 'reception1', password: 'clinic123', full_name: 'Bethlehem Assefa', physician_id: null, is_active: true, role_ids: ['role_receptionist'], last_login_at: null, created_at: nowIso() },
    { id: 'usr_4', username: 'labtech1', password: 'clinic123', full_name: 'Yared Mulugeta', physician_id: null, is_active: true, role_ids: ['role_lab_technician'], last_login_at: null, created_at: nowIso() },
    { id: 'usr_5', username: 'pharm1', password: 'clinic123', full_name: 'Meron Tsegaye', physician_id: null, is_active: false, role_ids: ['role_pharmacist'], last_login_at: null, created_at: nowIso() },
    { id: 'usr_6', username: 'pharm2', password: 'clinic123', full_name: 'Selamawit Bekele', physician_id: null, is_active: true, role_ids: ['role_pharmacist'], last_login_at: null, created_at: nowIso() },
  ];

  const labOrders = [
    { id: 'lord_1', visit_id: 'vis_1', patient_name: 'Abebe Kassahun', patient_code: 'S001', physician_id: 'phy_1', order_date: iso(0, 9, 30), status: 'pending' },
    { id: 'lord_2', visit_id: 'vis_2', patient_name: 'Yonas Tadesse', patient_code: 'S003', physician_id: 'phy_2', order_date: iso(0, 10, 15), status: 'completed' },
  ];
  const labOrderItems = [
    { id: 'litem_1', lab_order_id: 'lord_1', test_id: 'test_wbc', result_value: null, entered_by: null, entered_at: null },
    { id: 'litem_2', lab_order_id: 'lord_1', test_id: 'test_rbs', result_value: null, entered_by: null, entered_at: null },
    { id: 'litem_3', lab_order_id: 'lord_2', test_id: 'test_crea', result_value: '0.9 mg/dL', entered_by: 'usr_4', entered_at: iso(0, 11, 0) },
  ];

  const rxSeed = [
    { id: 'rx_1', visit_id: 'vis_1', patient_name: 'Abebe Kassahun', patient_code: 'S001', physician_id: 'phy_1', diagnosis_note: '', prescribed_date: iso(0, 9, 20) },
    { id: 'rx_2', visit_id: 'vis_3', patient_name: 'Sara Mekonnen', patient_code: 'S004', physician_id: 'phy_3', diagnosis_note: 'Acute pharyngitis', prescribed_date: iso(1, 14, 20) },
  ];
  const rxItems = [
    { id: 'rxi_1', prescription_id: 'rx_1', drug_id: 'drug_paracetamol', dosage: '500mg', frequency: '3x/day', duration: '3 days', quantity_prescribed: 9, instructions: 'Take with food' },
    { id: 'rxi_2', prescription_id: 'rx_2', drug_id: 'drug_amoxicillin', dosage: '500mg', frequency: '2x/day', duration: '7 days', quantity_prescribed: 14, instructions: '' },
  ];
  const dispensingSeed = [
    { id: 'disp_1', prescription_item_id: 'rxi_2', quantity_dispensed: 6, dispensed_by: 'usr_5', dispensed_at: iso(1, 15, 0) },
  ];

  return {
    users,
    physicians,
    patients,
    visits,
    registrations,
    certifications,
    admissions: [],
    admission_notes: [],
    lab_test_catalog,
    lab_orders: labOrders,
    lab_order_items: labOrderItems,
    drugs,
    drug_stock,
    prescriptions: rxSeed,
    prescription_items: rxItems,
    dispensing_records: dispensingSeed,
    referrals: [],
    sick_leaves: [],
    roles,
    settings: {
      clinic_name: 'TPPF Clinic',
      clinic_tagline: 'Occupational & Community Health Services',
      clinic_address: '',
      clinic_phone: '',
    },
    vitals: [],
    backups: [],
    meta: { patient_seq: 6, registration_seq: 5, seeded_at: nowIso() },
  };
}

// Fill in any fields/collections missing from a previously-cached DB
// (keeps older localStorage data working as the mock schema grows).
function migrateDb(db) {
  if (!db.registrations) db.registrations = [];
  if (!db.certifications) db.certifications = [];
  if (!db.admissions) db.admissions = [];
  if (!db.admission_notes) db.admission_notes = [];
  if (!db.lab_orders) db.lab_orders = [];
  if (!db.lab_order_items) db.lab_order_items = [];
  if (!db.lab_test_catalog || !db.lab_test_catalog.length) db.lab_test_catalog = buildSeed().lab_test_catalog;
  if (!db.drugs || !db.drugs.length) db.drugs = buildSeed().drugs;
  if (!db.drug_stock || !db.drug_stock.length) db.drug_stock = buildSeed().drug_stock;
  if (!db.prescriptions) db.prescriptions = [];
  if (!db.prescription_items) db.prescription_items = [];
  if (!db.dispensing_records) db.dispensing_records = [];
  if (!db.referrals) db.referrals = [];
  if (!db.sick_leaves) db.sick_leaves = [];
  if (!db.roles || !db.roles.length) db.roles = buildSeed().roles;
  if (!db.settings) db.settings = buildSeed().settings;
  if (!db.vitals) db.vitals = [];
  if (!db.backups) db.backups = [];
  if (db.users && db.users.some(u => u.roles && !u.role_ids)) {
    const nameToId = Object.fromEntries(db.roles.map(r => [r.display_name, r.id]));
    db.users.forEach(u => {
      if (u.roles && !u.role_ids) {
        u.role_ids = u.roles.map(r => nameToId[r]).filter(Boolean);
        delete u.roles;
      }
    });
  }
  if (!db.meta) db.meta = {};
  if (db.meta.registration_seq === undefined) db.meta.registration_seq = db.registrations.length;
  return db;
}

function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return migrateDb(JSON.parse(raw));
  } catch (e) { /* fall through to reseed */ }
  const seed = buildSeed();
  localStorage.setItem(DB_KEY, JSON.stringify(seed));
  return seed;
}

function saveDb(db) {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch (e) {
    // Private-browsing mode, storage disabled, or quota exceeded.
    // The action already applied to the in-memory db and will still
    // render for this page view — it just won't persist on reload.
    console.warn('TPPF mock DB: could not save to localStorage.', e);
  }
}

// ---------- state machine ----------
const VISIT_TRANSITIONS = {
  open: ['examined'],
  examined: ['diagnosed'],
  diagnosed: ['closed'],
  closed: [],
};

// registration statuses that can still receive a new certification exam
const CERTIFIABLE_STATUSES = ['pending', 'certified_fit', 'certified_unfit'];

// ---------- mock request router ----------
async function mockRequest(method, path, body) {
  await delay();
  const db = loadDb();
  const seg = path.split('?')[0].split('/').filter(Boolean);
  const qs = Object.fromEntries(new URLSearchParams(path.split('?')[1] || ''));

  // POST /auth/login
  if (method === 'POST' && seg[0] === 'auth' && seg[1] === 'login') {
    const user = db.users.find(u => u.username === body.username);
    if (!user || user.password !== body.password) {
      const err = new Error('Invalid username or password.');
      err.status = 401;
      throw err;
    }
    if (!user.is_active) {
      const err = new Error('This account has been deactivated.');
      err.status = 403;
      throw err;
    }
    user.last_login_at = nowIso();
    saveDb(db);
    const roleDisplayNames = (user.role_ids || []).map(rid => {
      const role = db.roles.find(r => r.id === rid);
      return role ? role.display_name : null;
    }).filter(Boolean);
    return {
      token: uid('tok'),
      user: { id: user.id, username: user.username, full_name: user.full_name, roles: roleDisplayNames, physician_id: user.physician_id || null },
    };
  }

  // GET /dashboard/stats
  if (method === 'GET' && seg[0] === 'dashboard' && seg[1] === 'stats') {
    const activePatients = db.patients.filter(p => p.is_active).length;
    const openVisits = db.visits.filter(v => v.status !== 'closed').length;
    const todayStr = new Date().toDateString();
    const visitsToday = db.visits.filter(v => new Date(v.visit_date).toDateString() === todayStr).length;

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      const count = db.visits.filter(v => new Date(v.visit_date).toDateString() === d.toDateString()).length;
      days.push({ label, count });
    }

    const statusCounts = { open: 0, examined: 0, diagnosed: 0, closed: 0 };
    db.visits.forEach(v => { statusCounts[v.status] = (statusCounts[v.status] || 0) + 1; });

    const newThisWeek = db.patients.filter(p => {
      const d = new Date(p.registered_date);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }).length;

    return {
      active_patients: activePatients,
      open_visits: openVisits,
      visits_today: visitsToday,
      new_patients_week: newThisWeek,
      visits_by_day: days,
      visits_by_status: statusCounts,
    };
  }

  // GET /physicians
  if (method === 'GET' && seg[0] === 'physicians') {
    return db.physicians.filter(p => p.is_active);
  }

  // /patients
  if (seg[0] === 'patients') {
    if (method === 'GET' && seg.length === 1) {
      let list = [...db.patients];
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(p => p.full_name.toLowerCase().includes(s) || p.patient_code.toLowerCase().includes(s) || (p.phone || '').includes(s));
      }
      if (qs.status === 'active') list = list.filter(p => p.is_active);
      if (qs.status === 'inactive') list = list.filter(p => !p.is_active);
      if (qs.department && qs.department !== 'all') list = list.filter(p => p.department === qs.department);
      list.sort((a, b) => new Date(b.registered_date) - new Date(a.registered_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const p = db.patients.find(x => x.id === seg[1]);
      if (!p) { const err = new Error('Patient not found.'); err.status = 404; throw err; }
      const patientVisits = db.visits.filter(v => v.patient_id === p.id)
        .sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
      return { ...p, visits: patientVisits };
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.full_name || !body.full_name.trim()) { const err = new Error('Full name is required.'); err.status = 422; throw err; }
      db.meta.patient_seq += 1;
      const code = `S${pad(db.meta.patient_seq, 3)}`;
      const patient = {
        id: uid('pat'),
        patient_code: code,
        full_name: body.full_name.trim(),
        date_of_birth: body.date_of_birth || null,
        gender: body.gender || null,
        location: body.location || '',
        address: body.address || '',
        phone: body.phone || '',
        source_employee_registration_id: null,
        registered_date: nowIso(),
        is_active: true,
      };
      db.patients.unshift(patient);
      saveDb(db);
      return patient;
    }
    if (method === 'PUT' && seg.length === 2) {
      const idx = db.patients.findIndex(x => x.id === seg[1]);
      if (idx === -1) { const err = new Error('Patient not found.'); err.status = 404; throw err; }
      db.patients[idx] = { ...db.patients[idx], ...body };
      saveDb(db);
      return db.patients[idx];
    }
  }

  // /visits
  if (seg[0] === 'visits') {
    if (method === 'GET' && seg.length === 1) {
      let list = db.visits.map(v => ({
        ...v,
        patient: db.patients.find(p => p.id === v.patient_id) || null,
        physician: db.physicians.find(p => p.id === v.physician_id) || null,
      }));
      if (qs.status) list = list.filter(v => v.status === qs.status);
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(v =>
          (v.patient && v.patient.full_name.toLowerCase().includes(s)) ||
          (v.patient && v.patient.patient_code.toLowerCase().includes(s)) ||
          v.chief_complaint.toLowerCase().includes(s)
        );
      }
      list.sort((a, b) => new Date(b.visit_date) - new Date(a.visit_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const v = db.visits.find(x => x.id === seg[1]);
      if (!v) { const err = new Error('Visit not found.'); err.status = 404; throw err; }
      return {
        ...v,
        patient: db.patients.find(p => p.id === v.patient_id) || null,
        physician: db.physicians.find(p => p.id === v.physician_id) || null,
      };
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.patient_id || !body.physician_id) { const err = new Error('Patient and physician are required.'); err.status = 422; throw err; }
      const visit = {
        id: uid('vis'),
        patient_id: body.patient_id,
        physician_id: body.physician_id,
        visit_date: nowIso(),
        status: 'open',
        chief_complaint: body.chief_complaint || '',
        examination_notes: '',
        diagnosis: null,
        disposition: null,
      };
      db.visits.unshift(visit);
      saveDb(db);
      return visit;
    }
    if (method === 'PUT' && seg.length === 2) {
      const idx = db.visits.findIndex(x => x.id === seg[1]);
      if (idx === -1) { const err = new Error('Visit not found.'); err.status = 404; throw err; }
      const current = db.visits[idx];
      const next = { ...current, ...body };

      if (body.status && body.status !== current.status) {
        const allowed = VISIT_TRANSITIONS[current.status] || [];
        if (!allowed.includes(body.status)) {
          const err = new Error(`Cannot move a visit from "${current.status}" to "${body.status}" directly.`);
          err.status = 422;
          throw err;
        }
        if (body.status === 'closed' && next.disposition === 'admitted') {
          const err = new Error('This visit is marked "admitted" but the Admissions module isn\'t built yet, so no admission record can exist. Closing is blocked until that module is available.');
          err.status = 422;
          throw err;
        }
      }
      db.visits[idx] = next;
      saveDb(db);
      return db.visits[idx];
    }
    // GET /visits/:id/vitals
    if (method === 'GET' && seg.length === 3 && seg[2] === 'vitals') {
      const v = db.visits.find(x => x.id === seg[1]);
      if (!v) { const err = new Error('Visit not found.'); err.status = 404; throw err; }
      return db.vitals
        .filter(vt => String(vt.visit_id) === String(seg[1]))
        .sort((a, b) => new Date(b.recorded_at) - new Date(a.recorded_at));
    }
    // POST /visits/:id/vitals
    if (method === 'POST' && seg.length === 3 && seg[2] === 'vitals') {
      const v = db.visits.find(x => x.id === seg[1]);
      if (!v) { const err = new Error('Visit not found.'); err.status = 404; throw err; }
      const fields = ['temperature_c', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'pulse_rate', 'respiratory_rate', 'weight_kg', 'height_cm'];
      const hasAny = fields.some(f => body[f] !== undefined && body[f] !== null && body[f] !== '');
      if (!hasAny) { const err = new Error('Enter at least one vital sign reading.'); err.status = 422; throw err; }
      const vital = {
        id: uid('vit'),
        visit_id: seg[1],
        recorded_at: nowIso(),
        recorded_by: null,
        temperature_c: body.temperature_c || null,
        blood_pressure_systolic: body.blood_pressure_systolic || null,
        blood_pressure_diastolic: body.blood_pressure_diastolic || null,
        pulse_rate: body.pulse_rate || null,
        respiratory_rate: body.respiratory_rate || null,
        weight_kg: body.weight_kg || null,
        height_cm: body.height_cm || null,
      };
      db.vitals.unshift(vital);
      saveDb(db);
      return vital;
    }
  }

  // /registrations
  if (seg[0] === 'registrations') {
    if (method === 'GET' && seg.length === 1) {
      let list = [...db.registrations];
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(r => r.full_name.toLowerCase().includes(s) || r.registration_code.toLowerCase().includes(s) || (r.occupation || '').toLowerCase().includes(s));
      }
      if (qs.status && qs.status !== 'all') list = list.filter(r => r.status === qs.status);
      if (qs.department && qs.department !== 'all') list = list.filter(r => r.department === qs.department);
      list.sort((a, b) => new Date(b.registration_date) - new Date(a.registration_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const r = db.registrations.find(x => x.id === seg[1]);
      if (!r) { const err = new Error('Registration not found.'); err.status = 404; throw err; }
      const certs = db.certifications
        .filter(c => c.employee_registration_id === r.id)
        .map(c => ({ ...c, physician: db.physicians.find(p => p.id === c.physician_id) || null }))
        .sort((a, b) => new Date(b.examination_date) - new Date(a.examination_date));
      const hiredPatient = db.patients.find(p => p.source_employee_registration_id === r.id) || null;
      return { ...r, certifications: certs, hired_patient: hiredPatient };
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.full_name || !body.full_name.trim()) { const err = new Error('Full name is required.'); err.status = 422; throw err; }
      if (!body.occupation || !body.occupation.trim()) { const err = new Error('Occupation applied for is required.'); err.status = 422; throw err; }
      db.meta.registration_seq += 1;
      const code = `R${pad(db.meta.registration_seq, 3)}`;
      const reg = {
        id: uid('reg'),
        registration_code: code,
        full_name: body.full_name.trim(),
        date_of_birth: body.date_of_birth || null,
        gender: body.gender || null,
        location: body.location || '',
        occupation: body.occupation.trim(),
        registration_date: nowIso(),
        status: 'pending',
      };
      db.registrations.unshift(reg);
      saveDb(db);
      return reg;
    }
    if (method === 'PUT' && seg.length === 2) {
      const idx = db.registrations.findIndex(x => x.id === seg[1]);
      if (idx === -1) { const err = new Error('Registration not found.'); err.status = 404; throw err; }
      const current = db.registrations[idx];
      if (current.status === 'hired') {
        const err = new Error('This candidate has already been hired; the registration record is permanent and cannot be edited.');
        err.status = 422;
        throw err;
      }
      if (body.status === 'withdrawn' && current.status === 'withdrawn') {
        // no-op, idempotent
      }
      db.registrations[idx] = { ...current, ...body };
      saveDb(db);
      return db.registrations[idx];
    }
    // POST /registrations/:id/hire
    if (method === 'POST' && seg.length === 3 && seg[2] === 'hire') {
      const reg = db.registrations.find(x => x.id === seg[1]);
      if (!reg) { const err = new Error('Registration not found.'); err.status = 404; throw err; }
      if (reg.status !== 'certified_fit') {
        const err = new Error('Only candidates certified fit can be hired.');
        err.status = 422;
        throw err;
      }
      db.meta.patient_seq += 1;
      const code = `S${pad(db.meta.patient_seq, 3)}`;
      const patient = {
        id: uid('pat'),
        patient_code: code,
        full_name: reg.full_name,
        date_of_birth: reg.date_of_birth,
        gender: reg.gender,
        location: reg.location,
        address: '',
        phone: '',
        source_employee_registration_id: reg.id,
        registered_date: nowIso(),
        is_active: true,
      };
      db.patients.unshift(patient);
      reg.status = 'hired';
      saveDb(db);
      return { patient, registration: reg };
    }
  }

  // /certifications
  if (seg[0] === 'certifications') {
    if (method === 'GET' && seg.length === 1) {
      let list = db.certifications.map(c => ({
        ...c,
        registration: db.registrations.find(r => r.id === c.employee_registration_id) || null,
        physician: db.physicians.find(p => p.id === c.physician_id) || null,
      }));
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(c => (c.registration && (c.registration.full_name.toLowerCase().includes(s) || c.registration.registration_code.toLowerCase().includes(s))));
      }
      if (qs.result && qs.result !== 'all') list = list.filter(c => c.result === qs.result);
      list.sort((a, b) => new Date(b.examination_date) - new Date(a.examination_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const c = db.certifications.find(x => x.id === seg[1]);
      if (!c) { const err = new Error('Certification not found.'); err.status = 404; throw err; }
      return {
        ...c,
        registration: db.registrations.find(r => r.id === c.employee_registration_id) || null,
        physician: db.physicians.find(p => p.id === c.physician_id) || null,
      };
    }
    if (method === 'POST' && seg.length === 1) {
      const reg = db.registrations.find(r => r.id === body.employee_registration_id);
      if (!reg) { const err = new Error('Select a valid candidate.'); err.status = 422; throw err; }
      if (!CERTIFIABLE_STATUSES.includes(reg.status)) {
        const err = new Error(`Cannot record a new exam for a candidate whose status is "${reg.status}".`);
        err.status = 422;
        throw err;
      }
      if (!body.physician_id) { const err = new Error('Select the examining physician.'); err.status = 422; throw err; }
      if (body.result !== 'fit' && body.result !== 'unfit') { const err = new Error('Exam result must be recorded as fit or unfit.'); err.status = 422; throw err; }

      const cert = {
        id: uid('cert'),
        employee_registration_id: reg.id,
        physician_id: body.physician_id,
        examination_date: nowIso(),
        physical_examination: body.physical_examination || '',
        personal_hygiene: body.personal_hygiene || '',
        skin_disease: body.skin_disease || '',
        stool_exam_direct: body.stool_exam_direct || '',
        syphilis: body.syphilis || '',
        gonorrhea: body.gonorrhea || '',
        other_findings: body.other_findings || '',
        result: body.result,
        treatment_note: body.treatment_note || '',
        treatment_result_note: body.treatment_result_note || '',
      };
      db.certifications.unshift(cert);
      reg.status = body.result === 'fit' ? 'certified_fit' : 'certified_unfit';
      saveDb(db);
      return { certification: cert, registration: reg };
    }
  }

  // /lab-test-catalog
  if (seg[0] === 'lab-test-catalog' && method === 'GET') {
    return db.lab_test_catalog;
  }

  // /admissions
  if (seg[0] === 'admissions') {
    if (method === 'GET' && seg.length === 1) {
      let list = [...db.admissions];
      if (qs.visit_id) list = list.filter(a => String(a.visit_id) === String(qs.visit_id));
      if (qs.status && qs.status !== 'all') list = list.filter(a => a.status === qs.status);
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(a => (a.patient_name || '').toLowerCase().includes(s) || (a.patient_code || '').toLowerCase().includes(s));
      }
      list.sort((a, b) => new Date(b.admitted_at) - new Date(a.admitted_at));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const a = db.admissions.find(x => x.id === seg[1]);
      if (!a) { const err = new Error('Admission not found.'); err.status = 404; throw err; }
      const notes = db.admission_notes
        .filter(n => n.admission_id === a.id)
        .sort((x, y) => new Date(y.recorded_at) - new Date(x.recorded_at));
      return { ...a, notes };
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.visit_id || !body.patient_id) { const err = new Error('A visit and patient are required.'); err.status = 422; throw err; }
      const existing = db.admissions.find(x => String(x.visit_id) === String(body.visit_id));
      if (existing) { const err = new Error('An admission record already exists for this visit.'); err.status = 422; throw err; }
      const admission = {
        id: uid('adm'),
        visit_id: body.visit_id,
        patient_id: body.patient_id,
        patient_name: body.patient_name || '',
        patient_code: body.patient_code || '',
        admitting_physician_id: body.admitting_physician_id || null,
        admitted_at: nowIso(),
        reason: body.reason || '',
        status: 'admitted',
        discharged_at: null,
        discharge_notes: null,
      };
      db.admissions.unshift(admission);
      saveDb(db);
      return admission;
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'notes') {
      const a = db.admissions.find(x => x.id === seg[1]);
      if (!a) { const err = new Error('Admission not found.'); err.status = 404; throw err; }
      if (!body.note || !body.note.trim()) { const err = new Error('Note text is required.'); err.status = 422; throw err; }
      const note = { id: uid('admn'), admission_id: a.id, note: body.note.trim(), recorded_by: body.recorded_by || null, recorded_at: nowIso() };
      db.admission_notes.unshift(note);
      saveDb(db);
      return note;
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'discharge') {
      const a = db.admissions.find(x => x.id === seg[1]);
      if (!a) { const err = new Error('Admission not found.'); err.status = 404; throw err; }
      if (a.status === 'discharged') { const err = new Error('This admission has already been discharged.'); err.status = 422; throw err; }
      a.status = 'discharged';
      a.discharged_at = nowIso();
      a.discharge_notes = body.discharge_notes || '';
      saveDb(db);
      return a;
    }
  }

  // /lab-orders
  if (seg[0] === 'lab-orders') {
    if (method === 'GET' && seg.length === 1) {
      let list = db.lab_orders.map(o => ({
        ...o,
        items: db.lab_order_items.filter(i => i.lab_order_id === o.id).map(i => ({
          ...i,
          test: db.lab_test_catalog.find(t => t.id === i.test_id) || null,
        })),
      }));
      if (qs.visit_id) list = list.filter(o => String(o.visit_id) === String(qs.visit_id));
      if (qs.status && qs.status !== 'all') list = list.filter(o => o.status === qs.status);
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(o => (o.patient_name || '').toLowerCase().includes(s) || (o.patient_code || '').toLowerCase().includes(s));
      }
      list.sort((a, b) => new Date(b.order_date) - new Date(a.order_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const o = db.lab_orders.find(x => x.id === seg[1]);
      if (!o) { const err = new Error('Lab order not found.'); err.status = 404; throw err; }
      const items = db.lab_order_items.filter(i => i.lab_order_id === o.id).map(i => ({
        ...i,
        test: db.lab_test_catalog.find(t => t.id === i.test_id) || null,
      }));
      return { ...o, items };
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.visit_id) { const err = new Error('A visit is required.'); err.status = 422; throw err; }
      if (!Array.isArray(body.test_ids) || !body.test_ids.length) { const err = new Error('Select at least one test.'); err.status = 422; throw err; }
      const order = {
        id: uid('lord'),
        visit_id: body.visit_id,
        patient_name: body.patient_name || '',
        patient_code: body.patient_code || '',
        physician_id: body.physician_id || null,
        order_date: nowIso(),
        status: 'pending',
      };
      db.lab_orders.unshift(order);
      body.test_ids.forEach(testId => {
        db.lab_order_items.push({ id: uid('litem'), lab_order_id: order.id, test_id: testId, result_value: null, entered_by: null, entered_at: null });
      });
      saveDb(db);
      return order;
    }
    if (method === 'PUT' && seg.length === 2) {
      const o = db.lab_orders.find(x => x.id === seg[1]);
      if (!o) { const err = new Error('Lab order not found.'); err.status = 404; throw err; }
      if (body.status && body.status !== o.status) {
        const allowed = { pending: ['in_progress'], in_progress: ['completed'], completed: [] };
        if (!(allowed[o.status] || []).includes(body.status)) {
          const err = new Error(`Cannot move a lab order from "${o.status}" to "${body.status}" directly.`);
          err.status = 422;
          throw err;
        }
        if (body.status === 'completed') {
          const items = db.lab_order_items.filter(i => i.lab_order_id === o.id);
          if (items.some(i => !i.result_value)) {
            const err = new Error('Enter a result for every test before marking this order completed.');
            err.status = 422;
            throw err;
          }
        }
        o.status = body.status;
      }
      saveDb(db);
      return o;
    }
    if (method === 'PUT' && seg.length === 4 && seg[2] === 'items') {
      const item = db.lab_order_items.find(x => x.id === seg[3]);
      if (!item) { const err = new Error('Lab order item not found.'); err.status = 404; throw err; }
      item.result_value = body.result_value || null;
      item.entered_by = body.entered_by || null;
      item.entered_at = item.result_value ? nowIso() : null;
      saveDb(db);
      return item;
    }
    if (method === 'DELETE' && seg.length === 2) {
      const idx = db.lab_orders.findIndex(x => String(x.id) === String(seg[1]));
      if (idx === -1) { const err = new Error('Lab order not found.'); err.status = 404; throw err; }
      db.lab_orders.splice(idx, 1);
      db.lab_order_items = db.lab_order_items.filter(i => String(i.lab_order_id) !== String(seg[1]));
      saveDb(db);
      return { success: true, id: seg[1] };
    }
  }



  function embedItemsForPrescription(rx) {
    const items = db.prescription_items.filter(i => i.prescription_id === rx.id).map(i => {
      const drug = db.drugs.find(d => d.id === i.drug_id) || null;
      const dispensedTotal = db.dispensing_records
        .filter(d => d.prescription_item_id === i.id)
        .reduce((sum, d) => sum + d.quantity_dispensed, 0);
      const records = db.dispensing_records
        .filter(d => d.prescription_item_id === i.id)
        .sort((a, b) => new Date(b.dispensed_at) - new Date(a.dispensed_at));
      return {
        ...i,
        drug,
        dispensed_total: dispensedTotal,
        remaining: i.quantity_prescribed - dispensedTotal,
        dispensing_records: records,
      };
    });
    const status = items.every(i => i.remaining <= 0) ? 'fulfilled' : 'active';
    return { ...rx, items, status };
  }

  // /drugs
  if (seg[0] === 'drugs') {
    if (method === 'GET' && seg.length === 1) {
      return db.drugs.map(d => ({ ...d, stock: db.drug_stock.find(s => s.drug_id === d.id) || { quantity_on_hand: 0, reorder_threshold: 0 } }));
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.name || !body.name.trim()) { const err = new Error('Drug name is required.'); err.status = 422; throw err; }
      const drug = { id: uid('drug'), name: body.name.trim(), unit: body.unit || '', description: body.description || '' };
      db.drugs.push(drug);
      db.drug_stock.push({ drug_id: drug.id, quantity_on_hand: Number(body.initial_quantity) || 0, reorder_threshold: Number(body.reorder_threshold) || 0 });
      saveDb(db);
      return { ...drug, stock: db.drug_stock.find(s => s.drug_id === drug.id) };
    }
  }

  // /drug-stock/:drugId  (restock adjustment)
  if (seg[0] === 'drug-stock' && method === 'PUT' && seg.length === 2) {
    const stock = db.drug_stock.find(s => s.drug_id === seg[1]);
    if (!stock) { const err = new Error('Stock record not found.'); err.status = 404; throw err; }
    const delta = Number(body.delta) || 0;
    if (stock.quantity_on_hand + delta < 0) {
      const err = new Error('Stock cannot go below zero.');
      err.status = 422;
      throw err;
    }
    stock.quantity_on_hand += delta;
    saveDb(db);
    return stock;
  }

  // /prescriptions
  if (seg[0] === 'prescriptions') {
    if (method === 'GET' && seg.length === 1) {
      let list = db.prescriptions.map(embedItemsForPrescription);
      if (qs.visit_id) list = list.filter(rx => String(rx.visit_id) === String(qs.visit_id));
      if (qs.status && qs.status !== 'all') list = list.filter(rx => rx.status === qs.status);
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(rx => (rx.patient_name || '').toLowerCase().includes(s) || (rx.patient_code || '').toLowerCase().includes(s));
      }
      list.sort((a, b) => new Date(b.prescribed_date) - new Date(a.prescribed_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const rx = db.prescriptions.find(x => x.id === seg[1]);
      if (!rx) { const err = new Error('Prescription not found.'); err.status = 404; throw err; }
      return embedItemsForPrescription(rx);
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.visit_id) { const err = new Error('A visit is required.'); err.status = 422; throw err; }
      if (!Array.isArray(body.items) || !body.items.length) { const err = new Error('Add at least one drug.'); err.status = 422; throw err; }
      const rx = {
        id: uid('rx'),
        visit_id: body.visit_id,
        patient_name: body.patient_name || '',
        patient_code: body.patient_code || '',
        physician_id: body.physician_id || null,
        diagnosis_note: body.diagnosis_note || '',
        prescribed_date: nowIso(),
      };
      db.prescriptions.unshift(rx);
      body.items.forEach(it => {
        if (!it.drug_id || !it.quantity_prescribed) return;
        db.prescription_items.push({
          id: uid('rxi'),
          prescription_id: rx.id,
          drug_id: it.drug_id,
          dosage: it.dosage || '',
          frequency: it.frequency || '',
          duration: it.duration || '',
          quantity_prescribed: Number(it.quantity_prescribed),
          instructions: it.instructions || '',
        });
      });
      saveDb(db);
      return embedItemsForPrescription(rx);
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'dispense') {
      const rx = db.prescriptions.find(x => x.id === seg[1]);
      if (!rx) { const err = new Error('Prescription not found.'); err.status = 404; throw err; }
      const item = db.prescription_items.find(i => i.id === body.item_id && i.prescription_id === rx.id);
      if (!item) { const err = new Error('Prescription item not found.'); err.status = 404; throw err; }

      const qty = Number(body.quantity);
      if (!qty || qty <= 0) { const err = new Error('Enter a quantity to dispense.'); err.status = 422; throw err; }

      const alreadyDispensed = db.dispensing_records
        .filter(d => d.prescription_item_id === item.id)
        .reduce((sum, d) => sum + d.quantity_dispensed, 0);
      const remaining = item.quantity_prescribed - alreadyDispensed;
      if (qty > remaining) {
        const err = new Error(`Cannot dispense more than the ${remaining} unit(s) remaining on this item.`);
        err.status = 422;
        throw err;
      }

      const stock = db.drug_stock.find(s => s.drug_id === item.drug_id);
      if (!stock || stock.quantity_on_hand < qty) {
        const err = new Error('Not enough stock on hand to dispense this quantity.');
        err.status = 422;
        throw err;
      }

      stock.quantity_on_hand -= qty;
      const record = {
        id: uid('disp'),
        prescription_item_id: item.id,
        quantity_dispensed: qty,
        dispensed_by: body.dispensed_by || null,
        dispensed_at: nowIso(),
      };
      db.dispensing_records.unshift(record);
      saveDb(db);
      return embedItemsForPrescription(rx);
    }
    if (method === 'DELETE' && seg.length === 2) {
      const rxId = seg[1];
      const idx = db.prescriptions.findIndex(x => String(x.id) === String(rxId));
      if (idx === -1) { const err = new Error('Prescription not found.'); err.status = 404; throw err; }
      
      // Restore stock
      const items = db.prescription_items.filter(i => String(i.prescription_id) === String(rxId));
      items.forEach(it => {
        const dispensed = db.dispensing_records.filter(d => String(d.prescription_item_id) === String(it.id));
        const totalDisp = dispensed.reduce((sum, d) => sum + d.quantity_dispensed, 0);
        if (totalDisp > 0) {
          const stock = db.drug_stock.find(s => String(s.drug_id) === String(it.drug_id));
          if (stock) stock.quantity_on_hand += totalDisp;
        }
        db.dispensing_records = db.dispensing_records.filter(d => String(d.prescription_item_id) !== String(it.id));
      });

      db.prescription_items = db.prescription_items.filter(i => String(i.prescription_id) !== String(rxId));
      db.prescriptions.splice(idx, 1);
      saveDb(db);
      return { success: true, id: rxId };
    }
  }


  // /referrals
  if (seg[0] === 'referrals') {
    if (method === 'GET' && seg.length === 1) {
      let list = [...db.referrals];
      if (qs.visit_id) list = list.filter(r => String(r.visit_id) === String(qs.visit_id));
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(r => (r.patient_name || '').toLowerCase().includes(s) || (r.patient_code || '').toLowerCase().includes(s));
      }
      list.sort((a, b) => new Date(b.referral_date) - new Date(a.referral_date));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const r = db.referrals.find(x => x.id === seg[1]);
      if (!r) { const err = new Error('Referral not found.'); err.status = 404; throw err; }
      return r;
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.visit_id) { const err = new Error('A visit is required.'); err.status = 422; throw err; }
      if (!body.referred_to || !body.referred_to.trim()) { const err = new Error('Enter where the patient is being referred to.'); err.status = 422; throw err; }
      const referral = {
        id: uid('ref'),
        visit_id: body.visit_id,
        patient_name: body.patient_name || '',
        patient_code: body.patient_code || '',
        physician_id: body.physician_id || null,
        diagnosis: body.diagnosis || '',
        referral_date: nowIso(),
        reason: body.reason || '',
        referred_to: body.referred_to.trim(),
        note: body.note || '',
      };
      db.referrals.unshift(referral);
      saveDb(db);
      return referral;
    }
    if (method === 'DELETE' && seg.length === 2) {
      const idx = db.referrals.findIndex(x => String(x.id) === String(seg[1]));
      if (idx === -1) { const err = new Error('Referral not found.'); err.status = 404; throw err; }
      db.referrals.splice(idx, 1);
      saveDb(db);
      return { success: true, id: seg[1] };
    }
  }

  // /sick-leaves
  if (seg[0] === 'sick-leaves') {
    if (method === 'GET' && seg.length === 1) {
      let list = [...db.sick_leaves];
      if (qs.visit_id) list = list.filter(s => String(s.visit_id) === String(qs.visit_id));
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(sl => (sl.patient_name || '').toLowerCase().includes(s) || (sl.patient_code || '').toLowerCase().includes(s));
      }
      list.sort((a, b) => new Date(b.leave_start) - new Date(a.leave_start));
      return list;
    }
    if (method === 'GET' && seg.length === 2) {
      const s = db.sick_leaves.find(x => x.id === seg[1]);
      if (!s) { const err = new Error('Sick leave not found.'); err.status = 404; throw err; }
      return s;
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.visit_id) { const err = new Error('A visit is required.'); err.status = 422; throw err; }
      if (!body.leave_start || !body.leave_end) { const err = new Error('Enter both a start and end date.'); err.status = 422; throw err; }
      if (new Date(body.leave_end) < new Date(body.leave_start)) {
        const err = new Error('The end date cannot be before the start date.');
        err.status = 422;
        throw err;
      }
      const sickLeave = {
        id: uid('sl'),
        visit_id: body.visit_id,
        patient_name: body.patient_name || '',
        patient_code: body.patient_code || '',
        physician_id: body.physician_id || null,
        diagnosis: body.diagnosis || '',
        exam_date: body.exam_date || nowIso(),
        leave_start: body.leave_start,
        leave_end: body.leave_end,
      };
      db.sick_leaves.unshift(sickLeave);
      saveDb(db);
      return sickLeave;
    }
    if (method === 'DELETE' && seg.length === 2) {
      const idx = db.sick_leaves.findIndex(x => String(x.id) === String(seg[1]));
      if (idx === -1) { const err = new Error('Sick leave not found.'); err.status = 404; throw err; }
      db.sick_leaves.splice(idx, 1);
      saveDb(db);
      return { success: true, id: seg[1] };
    }
  }


  // /roles
  if (seg[0] === 'roles' && method === 'GET') {
    return db.roles;
  }

  // /users
  if (seg[0] === 'users') {
    if (method === 'GET' && seg.length === 1) {
      let list = db.users.map(u => ({
        ...u,
        password: undefined,
        roles: (u.role_ids || []).map(rid => db.roles.find(r => r.id === rid)).filter(Boolean),
      }));
      if (qs.search) {
        const s = qs.search.toLowerCase();
        list = list.filter(u => u.username.toLowerCase().includes(s) || (u.full_name || '').toLowerCase().includes(s));
      }
      if (qs.status === 'active') list = list.filter(u => u.is_active);
      if (qs.status === 'inactive') list = list.filter(u => !u.is_active);
      list.sort((a, b) => a.username.localeCompare(b.username));
      return list;
    }
    if (method === 'POST' && seg.length === 1) {
      if (!body.username || !body.username.trim()) { const err = new Error('Username is required.'); err.status = 422; throw err; }
      if (db.users.some(u => u.username === body.username.trim())) { const err = new Error('That username is already taken.'); err.status = 422; throw err; }
      if (!body.password || body.password.length < 6) { const err = new Error('Password must be at least 6 characters.'); err.status = 422; throw err; }
      if (!Array.isArray(body.role_ids) || !body.role_ids.length) { const err = new Error('Assign at least one role.'); err.status = 422; throw err; }
      const user = {
        id: uid('usr'),
        username: body.username.trim(),
        password: body.password,
        full_name: body.full_name || '',
        physician_id: body.physician_id || null,
        is_active: true,
        role_ids: body.role_ids,
        last_login_at: null,
        created_at: nowIso(),
      };
      db.users.push(user);
      saveDb(db);
      return { ...user, password: undefined, roles: user.role_ids.map(rid => db.roles.find(r => r.id === rid)).filter(Boolean) };
    }
    if (method === 'PUT' && seg.length === 2) {
      const user = db.users.find(u => u.id === seg[1]);
      if (!user) { const err = new Error('User not found.'); err.status = 404; throw err; }
      if (body.full_name !== undefined) user.full_name = body.full_name;
      if (body.physician_id !== undefined) user.physician_id = body.physician_id || null;
      if (body.role_ids !== undefined) {
        if (!Array.isArray(body.role_ids) || !body.role_ids.length) { const err = new Error('Assign at least one role.'); err.status = 422; throw err; }
        user.role_ids = body.role_ids;
      }
      if (body.is_active !== undefined) {
        if (user.username === 'admin' && !body.is_active) { const err = new Error('The built-in admin account cannot be deactivated.'); err.status = 422; throw err; }
        user.is_active = body.is_active;
      }
      saveDb(db);
      return { ...user, password: undefined, roles: user.role_ids.map(rid => db.roles.find(r => r.id === rid)).filter(Boolean) };
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'reset-password') {
      const user = db.users.find(u => u.id === seg[1]);
      if (!user) { const err = new Error('User not found.'); err.status = 404; throw err; }
      if (!body.password || body.password.length < 6) { const err = new Error('Password must be at least 6 characters.'); err.status = 422; throw err; }
      user.password = body.password;
      saveDb(db);
      return { ok: true };
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'change-password') {
      const user = db.users.find(u => u.id === seg[1]);
      if (!user) { const err = new Error('User not found.'); err.status = 404; throw err; }
      if (user.password !== body.current_password) { const err = new Error('Current password is incorrect.'); err.status = 401; throw err; }
      if (!body.new_password || body.new_password.length < 6) { const err = new Error('New password must be at least 6 characters.'); err.status = 422; throw err; }
      user.password = body.new_password;
      saveDb(db);
      return { ok: true };
    }
  }

  // /profile
  if (seg[0] === 'profile') {
    const session = Auth.getSession();
    const userId = session ? session.user.id : 'usr_admin';
    let user = db.users.find(u => String(u.id) === String(userId)) || db.users[0];
    if (method === 'GET') {
      return { ...user, password: undefined, roles: (user.role_ids || []).map(rid => db.roles.find(r => r.id === rid)).filter(Boolean) };
    }
    if (method === 'PUT') {
      if (body.username !== undefined) {
        if (!body.username.trim()) { const err = new Error('Username is required.'); err.status = 422; throw err; }
        user.username = body.username.trim();
      }
      if (body.full_name !== undefined) user.full_name = body.full_name.trim();
      if (body.new_password) {
        if (body.new_password.length < 6) { const err = new Error('Password must be at least 6 characters.'); err.status = 422; throw err; }
        user.password = body.new_password;
      }
      saveDb(db);
      return { ...user, password: undefined, roles: (user.role_ids || []).map(rid => db.roles.find(r => r.id === rid)).filter(Boolean) };
    }
  }

  // /settings
  if (seg[0] === 'settings') {
    if (method === 'GET') return db.settings;
    if (method === 'PUT') {
      db.settings = { ...db.settings, ...body };
      saveDb(db);
      return db.settings;
    }
  }

  // /backups
  if (seg[0] === 'backups') {
    if (method === 'GET' && seg[1] === 'schedule') {
      return db.backup_schedule || { enabled: false, frequency: 'daily', time_of_day: '02:00', retention_count: 14 };
    }
    if (method === 'PUT' && seg[1] === 'schedule') {
      db.backup_schedule = { ...(db.backup_schedule || {}), ...body };
      saveDb(db);
      return db.backup_schedule;
    }
    if (method === 'GET') {
      return [...db.backups].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    if (method === 'POST' && seg[1] === 'import') {
      const backup = {
        id: uid('bkp'),
        filename: body.filename || `imported_${Date.now()}.sql`,
        file_size: body.sql ? body.sql.length : 1500000,
        notes: body.label || 'Imported Backup',
        created_at: nowIso(),
      };
      db.backups.unshift(backup);
      saveDb(db);
      return {
        ok: true,
        message: body.restoreImmediately
          ? `Database imported and successfully restored from ${backup.filename}`
          : `Backup file ${backup.filename} imported successfully`,
        backup,
        restored: Boolean(body.restoreImmediately),
      };
    }
    if (method === 'POST' && seg.length === 3 && seg[2] === 'restore') {
      return { ok: true, message: `Database successfully restored from backup` };
    }
    if (method === 'POST') {
      const backup = {
        id: uid('bkp'),
        filename: `manual_backup_${Date.now()}.sql`,
        notes: body.label || `Manual backup`,
        file_size: Math.floor(400000 + Math.random() * 2200000),
        created_at: nowIso(),
        created_by: body.created_by || null,
      };
      db.backups.unshift(backup);
      saveDb(db);
      return backup;
    }
    if (method === 'DELETE' && seg.length === 2) {
      const idx = db.backups.findIndex(b => b.id === seg[1]);
      if (idx === -1) { const err = new Error('Backup not found.'); err.status = 404; throw err; }
      db.backups.splice(idx, 1);
      saveDb(db);
      return { ok: true };
    }
  }

  const err = new Error(`No mock handler for ${method} ${path}`);
  err.status = 404;
  throw err;
}

// ---------- public API surface ----------
async function apiRequest(method, path, body) {
  const forceMock = MOCK_ONLY_PATHS.some(p => path.split('?')[0].startsWith(p));
  if (USE_MOCK || forceMock) {
    if (path !== '/auth/login' && !Auth.isLoggedIn()) {
      Auth.handleSessionExpired('expired');
      const err = new Error('Session expired.');
      err.status = 401;
      throw err;
    }
    return mockRequest(method, path, body);
  }
  const session = Auth.getSession();
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') {
      Auth.handleSessionExpired('expired');
    }
    const err = new Error(data.message || 'Request failed.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const Api = {
  login: (username, password) => apiRequest('POST', '/auth/login', { username, password }),
  dashboardStats: () => apiRequest('GET', '/dashboard/stats'),
  physicians: {
    list: () => apiRequest('GET', '/physicians'),
  },
  patients: {
    list: (params = {}) => apiRequest('GET', `/patients?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/patients/${id}`),
    create: (data) => apiRequest('POST', '/patients', data),
    update: (id, data) => apiRequest('PUT', `/patients/${id}`, data),
    delete: (id) => apiRequest('DELETE', `/patients/${id}`),
    ensureRegistration: (id) => apiRequest('POST', `/patients/${id}/ensure-registration`),
    import: (records, options = {}) => apiRequest('POST', '/patients/import', { records, ...options }),
  },
  visits: {
    list: (params = {}) => apiRequest('GET', `/visits?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/visits/${id}`),
    create: (data) => apiRequest('POST', '/visits', data),
    update: (id, data) => apiRequest('PUT', `/visits/${id}`, data),
    delete: (id) => apiRequest('DELETE', `/visits/${id}`),
  },
  vitals: {
    list: (visitId) => apiRequest('GET', `/visits/${visitId}/vitals`),
    create: (visitId, data) => apiRequest('POST', `/visits/${visitId}/vitals`, data),
  },
  registrations: {
    list: (params = {}) => apiRequest('GET', `/registrations?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/registrations/${id}`),
    create: (data) => apiRequest('POST', '/registrations', data),
    update: (id, data) => apiRequest('PUT', `/registrations/${id}`, data),
    delete: (id) => apiRequest('DELETE', `/registrations/${id}`),
    acceptAsStaff: (id, data) => apiRequest('POST', `/registrations/${id}/accept-as-staff`, data),
    createVisit: (id, data = {}) => apiRequest('POST', `/registrations/${id}/create-visit`, data),
    import: (records, options = {}) => apiRequest('POST', '/registrations/import', { records, ...options }),
  },
  certifications: {
    list: (params = {}) => apiRequest('GET', `/certifications?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/certifications/${id}`),
    create: (data) => apiRequest('POST', '/certifications', data),
    update: (id, data) => apiRequest('PUT', `/certifications/${id}`, data),
  },
  admissions: {
    list: (params = {}) => apiRequest('GET', `/admissions?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/admissions/${id}`),
    create: (data) => apiRequest('POST', '/admissions', data),
    addNote: (id, note) => apiRequest('POST', `/admissions/${id}/notes`, { note }),
    discharge: (id, discharge_notes) => apiRequest('POST', `/admissions/${id}/discharge`, { discharge_notes }),
  },
  labCatalog: {
    list: () => apiRequest('GET', '/lab-test-catalog'),
  },
  labOrders: {
    list: (params = {}) => apiRequest('GET', `/lab-orders?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/lab-orders/${id}`),
    create: (data) => apiRequest('POST', '/lab-orders', data),
    updateStatus: (id, status) => apiRequest('PUT', `/lab-orders/${id}`, { status }),
    updateNote: (id, technician_note) => apiRequest('PUT', `/lab-orders/${id}`, { technician_note }),
    updateItem: (orderId, itemId, result_value) => apiRequest('PUT', `/lab-orders/${orderId}/items/${itemId}`, { result_value }),
    delete: (id) => apiRequest('DELETE', `/lab-orders/${id}`),
  },
  drugs: {
    list: () => apiRequest('GET', '/drugs'),
    create: (data) => apiRequest('POST', '/drugs', data),
    update: (id, data) => apiRequest('PUT', `/drugs/${id}`, data),
    adjustStock: (drugId, delta, expiry_date) => apiRequest('PUT', `/drug-stock/${drugId}`, { delta, expiry_date }),
    delete: (id) => apiRequest('DELETE', `/drugs/${id}`),
    import: (records, options = {}) => apiRequest('POST', '/drugs/import', { records, ...options }),
  },
  prescriptions: {
    list: (params = {}) => apiRequest('GET', `/prescriptions?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/prescriptions/${id}`),
    create: (data) => apiRequest('POST', '/prescriptions', data),
    dispense: (id, item_id, quantity) => apiRequest('POST', `/prescriptions/${id}/dispense`, { item_id, quantity }),
    delete: (id) => apiRequest('DELETE', `/prescriptions/${id}`),
  },

  referrals: {
    list: (params = {}) => apiRequest('GET', `/referrals?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/referrals/${id}`),
    create: (data) => apiRequest('POST', '/referrals', data),
    delete: (id) => apiRequest('DELETE', `/referrals/${id}`),
  },
  sickLeaves: {
    list: (params = {}) => apiRequest('GET', `/sick-leaves?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/sick-leaves/${id}`),
    create: (data) => apiRequest('POST', '/sick-leaves', data),
    delete: (id) => apiRequest('DELETE', `/sick-leaves/${id}`),
  },

  profile: {
    get: () => apiRequest('GET', '/profile'),
    update: (data) => apiRequest('PUT', '/profile', data),
  },
  roles: {
    list: () => apiRequest('GET', '/roles'),
    update: (id, data) => apiRequest('PUT', `/roles/${id}`, data),
  },
  users: {
    list: (params = {}) => apiRequest('GET', `/users?${new URLSearchParams(params)}`),
    create: (data) => apiRequest('POST', '/users', data),
    update: (id, data) => apiRequest('PUT', `/users/${id}`, data),
    delete: (id) => apiRequest('DELETE', `/users/${id}`),
    resetPassword: (id, password) => apiRequest('POST', `/users/${id}/reset-password`, { password }),
    changePassword: (id, current_password, new_password) => apiRequest('POST', `/users/${id}/change-password`, { current_password, new_password }),
  },
  settings: {
    get: () => apiRequest('GET', '/settings'),
    update: (data) => apiRequest('PUT', '/settings', data),
  },
  departments: {
    list: () => apiRequest('GET', '/departments'),
    get: (id) => apiRequest('GET', `/departments/${id}`),
    create: (data) => apiRequest('POST', '/departments', data),
    update: (id, data) => apiRequest('PUT', `/departments/${id}`, data),
    delete: (id, data = {}) => apiRequest('DELETE', `/departments/${id}`, data),
    addPosition: (deptId, data) => apiRequest('POST', `/departments/${deptId}/positions`, data),
    updatePosition: (deptId, posId, data) => apiRequest('PUT', `/departments/${deptId}/positions/${posId}`, data),
    deletePosition: (deptId, posId) => apiRequest('DELETE', `/departments/${deptId}/positions/${posId}`),
  },
  backups: {
    list: () => apiRequest('GET', '/backups'),
    create: (label) => apiRequest('POST', '/backups', { label }),
    remove: (id) => apiRequest('DELETE', `/backups/${id}`),
    restore: (id) => apiRequest('POST', `/backups/${id}/restore`),
    import: (data) => apiRequest('POST', '/backups/import', data),
    getSchedule: () => apiRequest('GET', '/backups/schedule'),
    updateSchedule: (data) => apiRequest('PUT', '/backups/schedule', data),
  },
  staff: {
    list: (params = {}) => apiRequest('GET', `/staff?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/staff/${id}`),
    getMedicalRecord: (id) => apiRequest('GET', `/staff/${id}/medical-record`),
  },
  checkups: {
    due: (params = {}) => apiRequest('GET', `/checkups/due?${new URLSearchParams(params)}`),
    all: (params = {}) => apiRequest('GET', `/checkups/all?${new URLSearchParams(params)}`),
    dispatchRenewal: (data) => apiRequest('POST', '/checkups/dispatch-renewal', data),
    approveRenewal: (data) => apiRequest('POST', '/checkups/approve-renewal', data),
    editExamDate: (data) => apiRequest('PUT', '/checkups/edit-exam-date', data),
  },
  auditLogs: {
    list: (params = {}) => apiRequest('GET', `/audit-logs?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/audit-logs/${id}`),
    filters: () => apiRequest('GET', '/audit-logs/filters'),
    stats: () => apiRequest('GET', '/audit-logs/stats'),
  },
  get: (path) => apiRequest('GET', path),
  post: (path, data) => apiRequest('POST', path, data),
  put: (path, data) => apiRequest('PUT', path, data),
  delete: (path) => apiRequest('DELETE', path),
};

const API = Api;
if (typeof window !== 'undefined') {
  window.Api = Api;
  window.API = Api;
}
