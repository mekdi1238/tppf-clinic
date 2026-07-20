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

  return {
    users: [
      { id: 'usr_1', username: 'admin', password: 'admin123', full_name: 'System Administrator', physician_id: null, is_active: true, roles: ['System Administrator'], last_login_at: null },
    ],
    physicians,
    patients,
    visits,
    registrations,
    certifications,
    meta: { patient_seq: 6, registration_seq: 5, seeded_at: nowIso() },
  };
}

// Fill in any fields/collections missing from a previously-cached DB
// (keeps older localStorage data working as the mock schema grows).
function migrateDb(db) {
  if (!db.registrations) db.registrations = [];
  if (!db.certifications) db.certifications = [];
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
    return {
      token: uid('tok'),
      user: { id: user.id, username: user.username, full_name: user.full_name, roles: user.roles },
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

  const err = new Error(`No mock handler for ${method} ${path}`);
  err.status = 404;
  throw err;
}

// ---------- public API surface ----------
async function apiRequest(method, path, body) {
  if (USE_MOCK) {
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
  },
  visits: {
    list: (params = {}) => apiRequest('GET', `/visits?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/visits/${id}`),
    create: (data) => apiRequest('POST', '/visits', data),
    update: (id, data) => apiRequest('PUT', `/visits/${id}`, data),
  },
  registrations: {
    list: (params = {}) => apiRequest('GET', `/registrations?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/registrations/${id}`),
    create: (data) => apiRequest('POST', '/registrations', data),
    update: (id, data) => apiRequest('PUT', `/registrations/${id}`, data),
    hire: (id) => apiRequest('POST', `/registrations/${id}/hire`),
  },
  certifications: {
    list: (params = {}) => apiRequest('GET', `/certifications?${new URLSearchParams(params)}`),
    get: (id) => apiRequest('GET', `/certifications/${id}`),
    create: (data) => apiRequest('POST', '/certifications', data),
  },
};
