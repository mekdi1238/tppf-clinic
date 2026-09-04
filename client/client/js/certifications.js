/* ===========================================================
   Certifications page logic
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('certifications')) { throw new Error('redirecting'); }
renderShell('certifications');
setPageTitle('Certifications');

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('cert-modal-close').innerHTML = Icons.render('close');
document.getElementById('cert-detail-close').innerHTML = Icons.render('close');

const newCertBtn = document.getElementById('new-cert-btn');
if (newCertBtn && typeof Permissions !== 'undefined') {
  newCertBtn.style.display = Permissions.has('certs.create') ? 'inline-flex' : 'none';
}

const CERTIFIABLE = ['pending', 'certified_fit', 'certified_unfit', 'accepted_as_staff', 'hired'];
let physiciansCache = [];
let certifiableTargets = [];
let currentCerts = [];

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadLookups() {
  const [physicians, registrations, patients] = await Promise.all([
    Api.physicians.list(),
    Api.registrations.list({ status: 'all' }),
    Api.patients.list({ status: 'all' }),
  ]);
  physiciansCache = physicians;

  certifiableTargets = [];

  // 1. Add Certifiable Candidates from Registrations
  registrations.filter(r => CERTIFIABLE.includes(r.status)).forEach(r => {
    certifiableTargets.push({
      type: 'registration',
      id: r.id,
      value: `reg_${r.id}`,
      registration_id: r.id,
      patient_id: null,
      code: r.registration_code,
      name: r.full_name,
      department: r.department || 'General',
      position: r.occupation || 'Candidate',
      status: r.status,
    });
  });

  // 2. Add All Patients (Direct Employees / Walk-in Staff)
  patients.forEach(p => {
    certifiableTargets.push({
      type: 'patient',
      id: p.id,
      value: `pat_${p.id}`,
      patient_id: p.id,
      registration_id: p.source_employee_registration_id || null,
      code: p.patient_code,
      name: p.full_name,
      department: p.department || 'General',
      position: p.position || 'Staff',
      status: p.fitness_status || (p.is_active ? 'active' : 'inactive'),
    });
  });

  document.getElementById('cf-physician').innerHTML = `<option value="">Select Examining Physician…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');

  const regSelect = document.getElementById('cf-registration');
  if (!certifiableTargets.length) {
    regSelect.innerHTML = `<option value="">No candidates or employees found</option>`;
  } else {
    regSelect.innerHTML = `<option value="">Select a candidate or employee…</option>` +
      certifiableTargets.map(t => `<option value="${t.value}" data-type="${t.type}" data-status="${t.status}">[${t.type === 'patient' ? 'Employee' : 'Candidate'}] ${UI.escapeHtml(t.name)} — ${t.code}</option>`).join('');

    const targetOptions = certifiableTargets.map(t => ({
      value: t.value,
      label: `[${t.type === 'patient' ? 'Employee' : 'Candidate'}] ${t.name} (${t.code})`,
      sublabel: `${t.position || ''} · ${t.department || 'General'}`
    }));
    UI.makeSearchableSelect(regSelect, targetOptions, 'Search by employee/candidate name or code…');
  }
}

document.getElementById('cf-registration').addEventListener('change', (e) => {
  const opt = e.target.selectedOptions[0];
  const hint = document.getElementById('cf-registration-hint');
  if (!opt || !opt.value) { hint.textContent = ''; return; }
  const type = opt.dataset.type;
  const status = opt.dataset.status;
  if (type === 'patient') {
    hint.textContent = `Existing Employee Record (${status === 'fit' ? 'Routine / 6-Month Renewal' : 'Initial or Fitness Certificate'}).`;
  } else {
    hint.textContent = status === 'pending'
      ? 'Pre-employment First Examination.'
      : `Re-examination — status is "${UI.escapeHtml((status || '').replace('_', ' '))}".`;
  }
});

async function loadCerts() {
  const search = document.getElementById('search-input').value.trim();
  const result = document.getElementById('result-filter').value;
  try {
    currentCerts = await Api.certifications.list({ search, result });
    renderTable(currentCerts);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('certs-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('filecheck')}</div>
          <h3>No certification exams recorded</h3>
          <p>Try a different search or filter, or record a new exam.</p>
          <button class="btn btn-primary" onclick="openCertForm()">${Icons.render('plus')} Record Certification</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Employee / Candidate</th><th>Department &amp; Position</th><th>Physician</th><th>Exam date</th><th>Result</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map(c => {
            const targetName = c.target_name || (c.patient ? c.patient.full_name : (c.registration ? c.registration.full_name : '—'));
            const targetCode = c.target_code || (c.patient ? c.patient.patient_code : (c.registration ? c.registration.registration_code : ''));
            const isPatient = !!c.patient_id;
            const targetDept = c.target_department || (c.patient ? c.patient.department : (c.registration ? c.registration.department : 'General'));
            const targetPos = c.target_position || (c.patient ? c.patient.position : (c.registration ? c.registration.occupation : '—'));
            return `
              <tr>
                <td class="cell-primary" style="cursor:pointer;" onclick="openCertDetail('${c.id}')">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span class="badge ${isPatient ? 'badge-primary' : 'badge-neutral'}" style="font-size:11px; padding:2px 6px;">${isPatient ? 'Staff' : 'Candidate'}</span>
                    <span style="font-weight:600;">${UI.escapeHtml(targetName)}</span>
                    <span class="cell-code">${UI.escapeHtml(targetCode)}</span>
                  </div>
                </td>
                <td class="cell-muted">
                  <div>${UI.escapeHtml(targetPos)}</div>
                  <div style="font-size:11px; color:var(--color-text-muted);">${UI.escapeHtml(targetDept)}</div>
                </td>
                <td class="cell-muted">${UI.escapeHtml(c.physician ? c.physician.full_name : '—')}</td>
                <td class="cell-muted" style="font-weight:600;">${UI.formatDate(c.examination_date)}</td>
                <td>${UI.certResultBadge(c.result)}</td>
                <td><button class="icon-btn" title="View" onclick="openCertDetail('${c.id}')">${Icons.render('eye')}</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- New certification ----------
async function openCertForm(targetRegId = null, targetVisitId = null, targetPatientId = null) {
  if (!certifiableTargets.length) {
    UI.toast('No candidates or employees found.', 'danger');
    return;
  }
  document.getElementById('cert-form').reset();
  document.getElementById('cf-registration-hint').textContent = '';

  const clinicalPanel = document.getElementById('cf-clinical-content');
  clinicalPanel.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Loading examination findings…</p>`;

  let selectVal = null;
  if (targetPatientId) {
    selectVal = `pat_${targetPatientId}`;
  } else if (targetRegId) {
    selectVal = `reg_${targetRegId}`;
  } else if (targetVisitId) {
    try {
      const v = await Api.visits.get(targetVisitId);
      if (v && v.patient_id) {
        selectVal = `pat_${v.patient_id}`;
      } else if (v && v.patient && v.patient.source_employee_registration_id) {
        selectVal = `reg_${v.patient.source_employee_registration_id}`;
      }
    } catch (e) {}
  }

  if (selectVal) {
    const regSelect = document.getElementById('cf-registration');
    regSelect.value = selectVal;
    regSelect.dispatchEvent(new Event('change'));
  }

  // Load clinical findings for side-by-side view
  try {
    let visit = null;
    let vitals = [];
    if (targetVisitId) {
      visit = await Api.visits.get(targetVisitId);
      vitals = await Api.vitals.list(targetVisitId);
    } else if (targetPatientId) {
      const allVisits = await Api.visits.list();
      visit = allVisits.find(v => String(v.patient_id) === String(targetPatientId));
      if (visit) {
        vitals = await Api.vitals.list(visit.id);
      }
    } else if (targetRegId) {
      // Find patient by registration id
      const allVisits = await Api.visits.list();
      visit = allVisits.find(v => v.patient && String(v.patient.source_employee_registration_id) === String(targetRegId));
      if (visit) {
        vitals = await Api.vitals.list(visit.id);
      }
    }

    if (visit) {
      const vDate = UI.formatDateTime(visit.visit_date);
      const vNotes = visit.examination_notes ? UI.escapeHtml(visit.examination_notes) : '<em class="text-muted">None recorded</em>';
      const vDiag = visit.diagnosis ? UI.escapeHtml(visit.diagnosis) : '<em class="text-muted">None recorded</em>';
      const vTreat = visit.treatment ? UI.escapeHtml(visit.treatment) : '<em class="text-muted">None recorded</em>';

      let vitalsHtml = '<p class="text-muted" style="font-size:12px; margin:4px 0 0;">No vitals recorded.</p>';
      if (vitals.length > 0) {
        const latest = vitals[0];
        const bp = (latest.blood_pressure_systolic && latest.blood_pressure_diastolic) ? `${latest.blood_pressure_systolic}/${latest.blood_pressure_diastolic} mmHg` : '—';
        vitalsHtml = `
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:12px; margin-top:6px; background:var(--color-surface); padding:8px; border-radius:6px; border:1px solid var(--color-border-subtle);">
            <div><strong>Temp:</strong> ${latest.temperature_c ? latest.temperature_c + '°C' : '—'}</div>
            <div><strong>BP:</strong> ${bp}</div>
            <div><strong>Pulse:</strong> ${latest.pulse_rate ? latest.pulse_rate + '/min' : '—'}</div>
            <div><strong>Resp:</strong> ${latest.respiratory_rate ? latest.respiratory_rate + '/min' : '—'}</div>
            <div><strong>Weight:</strong> ${latest.weight_kg ? latest.weight_kg + 'kg' : '—'}</div>
            <div><strong>Height:</strong> ${latest.height_cm ? latest.height_cm + 'cm' : '—'}</div>
          </div>
        `;
      }

      clinicalPanel.innerHTML = `
        <div style="font-size:12px; color:var(--color-text-muted); margin-bottom:10px;">
          <strong>Visit Date:</strong> ${vDate}<br/>
          <strong>Chief Complaint:</strong> ${UI.escapeHtml(visit.chief_complaint || '—')}
        </div>

        <div style="margin-bottom:10px;">
          <div style="font-weight:700; font-size:12.5px; color:var(--color-text);">Examination Notes:</div>
          <div style="font-size:12.5px; margin-top:2px; background:var(--color-surface); padding:8px; border-radius:6px; border:1px solid var(--color-border-subtle);">${vNotes}</div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="font-weight:700; font-size:12.5px; color:var(--color-primary-dark);">Diagnosis:</div>
          <div style="font-size:12.5px; margin-top:2px; background:var(--color-surface); padding:8px; border-radius:6px; border:1px solid var(--color-border-subtle);">${vDiag}</div>
        </div>

        <div style="margin-bottom:10px;">
          <div style="font-weight:700; font-size:12.5px; color:var(--color-text);">Treatment Plan:</div>
          <div style="font-size:12.5px; margin-top:2px; background:var(--color-surface); padding:8px; border-radius:6px; border:1px solid var(--color-border-subtle);">${vTreat}</div>
        </div>

        <div>
          <div style="font-weight:700; font-size:12.5px; color:var(--color-text);">Vitals Reading:</div>
          ${vitalsHtml}
        </div>
      `;
    } else {
      clinicalPanel.innerHTML = `
        <div class="notice notice-info" style="font-size:12.5px; margin:0;">
          No clinical visit has been completed yet for this candidate. You can record certification results directly or open a visit first.
        </div>
      `;
    }
  } catch (err) {
    clinicalPanel.innerHTML = `<p class="text-muted" style="font-size:12.5px;">Unable to load visit findings.</p>`;
  }

  document.getElementById('cert-modal-backdrop').classList.add('visible');
}
function closeCertForm() {
  document.getElementById('cert-modal-backdrop').classList.remove('visible');
}
document.getElementById('new-cert-btn').addEventListener('click', () => openCertForm());
document.getElementById('cert-modal-close').addEventListener('click', closeCertForm);
document.getElementById('cert-form-cancel').addEventListener('click', closeCertForm);
document.getElementById('cert-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'cert-modal-backdrop') closeCertForm();
});

document.getElementById('cert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const rawTarget = document.getElementById('cf-registration').value;
  let patientId = null;
  let regId = null;

  if (rawTarget.startsWith('pat_')) {
    patientId = rawTarget.replace('pat_', '');
  } else if (rawTarget.startsWith('reg_')) {
    regId = rawTarget.replace('reg_', '');
  } else if (rawTarget) {
    const found = certifiableTargets.find(t => String(t.value) === String(rawTarget) || String(t.id) === String(rawTarget));
    if (found) {
      if (found.type === 'patient') patientId = found.id;
      else regId = found.id;
    } else {
      regId = rawTarget;
    }
  }

  const payload = {
    patient_id: patientId,
    employee_registration_id: regId,
    physician_id: document.getElementById('cf-physician').value,
    physical_examination: document.getElementById('cf-physical').value,
    personal_hygiene: document.getElementById('cf-hygiene').value,
    skin_disease: document.getElementById('cf-skin').value,
    stool_exam_direct: document.getElementById('cf-stool').value,
    syphilis: document.getElementById('cf-syphilis').value,
    gonorrhea: document.getElementById('cf-gonorrhea').value,
    other_findings: document.getElementById('cf-other').value.trim(),
    result: document.getElementById('cf-result').value,
    treatment_note: document.getElementById('cf-treatment').value.trim(),
  };

  if ((!payload.patient_id && !payload.employee_registration_id) || !payload.physician_id || !payload.result) {
    UI.toast('Select an employee/candidate, physician, and result.', 'danger');
    return;
  }
  const btn = document.getElementById('cert-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.certifications.create(payload);
    UI.toast(`Exam certificate recorded: ${payload.result === 'fit' ? 'Certified Fit' : 'Unfit'}.`);
    closeCertForm();
    await loadLookups();
    await loadCerts();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Exam Result';
  }
});

// ---------- Certification detail ----------
let currentCertDetail = null;

async function openCertDetail(id) {
  try {
    const c = await Api.certifications.get(id);
    currentCertDetail = c;
    const targetName = c.target_name || (c.patient ? c.patient.full_name : (c.registration ? c.registration.full_name : 'Certification'));
    const targetCode = c.target_code || (c.patient ? c.patient.patient_code : (c.registration ? c.registration.registration_code : ''));
    const photoUrl = (c.patient && c.patient.photo_url) || (c.registration && c.registration.photo_url) || null;
    const isPatient = !!c.patient_id;

    document.getElementById('cd-name').textContent = targetName;
    document.getElementById('cd-sub').textContent = `${targetCode} · ${UI.formatDateTime(c.examination_date)}`;

    const avatarSlot = document.getElementById('cd-avatar-slot');
    if (avatarSlot) {
      avatarSlot.innerHTML = UI.avatar(targetName, photoUrl, 'width:48px; height:48px; font-size:16px; border-radius:50%;');
    }

    const typeBadge = c.certification_type === 'periodic_renewal'
      ? '<span class="badge badge-info" style="margin-left:8px;">Periodic Renewal</span>'
      : '<span class="badge badge-neutral" style="margin-left:8px;">Pre-Employment</span>';

    document.getElementById('cert-detail-body').innerHTML = `
      <div style="margin-bottom:14px;">${UI.certResultBadge(c.result)}${typeBadge}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Record Type</div><div class="v">${isPatient ? 'Staff / Employee' : 'Pre-Employment Candidate'}</div></div>
        <div class="detail-item"><div class="k">Physician</div><div class="v">${UI.escapeHtml(c.physician ? c.physician.full_name : '—')}</div></div>
        <div class="detail-item"><div class="k">Physical examination</div><div class="v" style="text-transform:capitalize;">${c.physical_examination || '—'}</div></div>
        <div class="detail-item"><div class="k">Personal hygiene</div><div class="v" style="text-transform:capitalize;">${c.personal_hygiene || '—'}</div></div>
        <div class="detail-item"><div class="k">Skin disease</div><div class="v" style="text-transform:capitalize;">${c.skin_disease || '—'}</div></div>
        <div class="detail-item"><div class="k">Stool exam (direct)</div><div class="v" style="text-transform:capitalize;">${c.stool_exam_direct || '—'}</div></div>
        <div class="detail-item"><div class="k">Syphilis</div><div class="v" style="text-transform:capitalize;">${c.syphilis || '—'}</div></div>
        <div class="detail-item"><div class="k">Gonorrhea</div><div class="v" style="text-transform:capitalize;">${c.gonorrhea || '—'}</div></div>
      </div>
      ${c.other_findings ? `<div class="detail-item" style="margin-top:12px;"><div class="k">Other findings</div><div class="v" style="font-weight:500;">${UI.escapeHtml(c.other_findings)}</div></div>` : ''}
      ${c.treatment_note ? `<div class="detail-item" style="margin-top:12px;"><div class="k">Treatment note</div><div class="v" style="font-weight:500;">${UI.escapeHtml(c.treatment_note)}</div></div>` : ''}
    `;

    const viewBtn = document.getElementById('cd-view-candidate');
    if (viewBtn) {
      viewBtn.textContent = isPatient ? 'View Patient Profile' : 'View Candidate Registration';
      viewBtn.onclick = () => {
        if (c.patient_id) {
          window.location.href = `patients.html?open=${c.patient_id}`;
        } else {
          window.location.href = `registrations.html?open=${c.employee_registration_id}`;
        }
      };
    }
    document.getElementById('cert-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}
function closeCertDetail() {
  document.getElementById('cert-detail-backdrop').classList.remove('visible');
}
document.getElementById('cert-detail-close').addEventListener('click', closeCertDetail);
document.getElementById('cert-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'cert-detail-backdrop') closeCertDetail();
});

// ---------- Edit Certification (Change C) ----------
document.getElementById('cert-edit-close').innerHTML = Icons.render('close');

function openEditCert() {
  if (!currentCertDetail) return;
  const c = currentCertDetail;

  document.getElementById('ce-cert-id').value = c.id;
  const editTargetName = c.target_name || (c.patient ? c.patient.full_name : (c.registration ? c.registration.full_name : ''));
  const editTargetCode = c.target_code || (c.patient ? c.patient.patient_code : (c.registration ? c.registration.registration_code : ''));
  document.getElementById('ce-sub').textContent = `${editTargetName} — ${editTargetCode}`;

  // Pre-fill exam date
  if (c.examination_date) {
    const dt = new Date(c.examination_date);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('ce-exam-date').value = local;
  } else {
    document.getElementById('ce-exam-date').value = '';
  }

  // Populate physician dropdown
  const physSelect = document.getElementById('ce-physician');
  physSelect.innerHTML = `<option value="">— keep current —</option>` +
    physiciansCache.map(p => `<option value="${p.id}" ${c.physician_id == p.id ? 'selected' : ''}>${UI.escapeHtml(p.full_name)}</option>`).join('');

  // Pre-fill selects with current values
  const setSelect = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; else if (el) el.value = ''; };
  setSelect('ce-result', c.result);
  setSelect('ce-physical', c.physical_examination);
  setSelect('ce-hygiene', c.personal_hygiene);
  setSelect('ce-skin', c.skin_disease);
  setSelect('ce-stool', c.stool_exam_direct);
  setSelect('ce-syphilis', c.syphilis);
  setSelect('ce-gonorrhea', c.gonorrhea);
  document.getElementById('ce-other').value = c.other_findings || '';
  document.getElementById('ce-treatment').value = c.treatment_note || '';

  closeCertDetail();
  document.getElementById('cert-edit-backdrop').classList.add('visible');
}

function closeEditCert() {
  document.getElementById('cert-edit-backdrop').classList.remove('visible');
}

document.getElementById('cd-edit-cert').addEventListener('click', openEditCert);
document.getElementById('cert-edit-close').addEventListener('click', closeEditCert);
document.getElementById('cert-edit-cancel').addEventListener('click', closeEditCert);
document.getElementById('cert-edit-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'cert-edit-backdrop') closeEditCert();
});

document.getElementById('cert-edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const certId = document.getElementById('ce-cert-id').value;
  if (!certId) return;

  const payload = {};
  const examDate = document.getElementById('ce-exam-date').value;
  if (examDate) payload.examination_date = new Date(examDate).toISOString();

  const addIfSet = (id, key) => { const v = document.getElementById(id).value; if (v) payload[key] = v; };
  addIfSet('ce-result', 'result');
  addIfSet('ce-physician', 'physician_id');
  addIfSet('ce-physical', 'physical_examination');
  addIfSet('ce-hygiene', 'personal_hygiene');
  addIfSet('ce-skin', 'skin_disease');
  addIfSet('ce-stool', 'stool_exam_direct');
  addIfSet('ce-syphilis', 'syphilis');
  addIfSet('ce-gonorrhea', 'gonorrhea');

  const other = document.getElementById('ce-other').value.trim();
  if (other) payload.other_findings = other;
  const treatment = document.getElementById('ce-treatment').value.trim();
  if (treatment) payload.treatment_note = treatment;

  if (Object.keys(payload).length === 0) {
    UI.toast('No changes made.', 'danger');
    return;
  }

  const btn = document.getElementById('cert-edit-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  try {
    await Api.certifications.update(certId, payload);
    UI.toast('Certification updated successfully.');
    closeEditCert();
    await loadCerts();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});

document.getElementById('search-input').addEventListener('input', debounce(loadCerts, 250));
document.getElementById('result-filter').addEventListener('change', loadCerts);

async function init() {
  await loadLookups();
  await loadCerts();
  const urlParams = new URLSearchParams(window.location.search);
  const patientId = urlParams.get('patientId');
  let regId = urlParams.get('regId');
  const visitId = urlParams.get('visitId');

  if (patientId || regId || visitId) {
    openCertForm(regId, visitId, patientId);
  }
}
init();

