/* ===========================================================
   Visits page logic
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('visits')) { throw new Error('redirecting'); }
renderShell('visits');
setPageTitle('Visits');

// Receptionist can see and check patients into a visit, but doesn't make
// clinical decisions — no editing exam notes/diagnosis/disposition, no
// advancing visit status, no originating lab/pharmacy/admission/referral
// actions from here. Every other allowed role (physician, or unrestricted)
// keeps full access.
const isReceptionist = RoleGuard.restrictedRole() === 'receptionist';

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('visit-modal-close').innerHTML = Icons.render('close');
document.getElementById('visit-detail-close').innerHTML = Icons.render('close');

let patientsCache = [];
let physiciansCache = [];
let currentVisits = [];

const NEXT_STATUS = { open: 'examined', examined: 'diagnosed', diagnosed: 'closed' };
const NEXT_STATUS_LABEL = { examined: 'Mark as Examined', diagnosed: 'Confirm Diagnosis', closed: 'Close Visit' };

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadLookups() {
  [patientsCache, physiciansCache] = await Promise.all([Api.patients.list(), Api.physicians.list()]);
  const patientSelect = document.getElementById('vf-patient');
  patientSelect.innerHTML = `<option value="">Select a patient…</option>` +
    patientsCache.filter(p => p.is_active).map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)} — ${p.patient_code}</option>`).join('');
  const physSelect = document.getElementById('vf-physician');
  physSelect.innerHTML = `<option value="">Select a physician…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');
}

async function loadVisits() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    currentVisits = await Api.visits.list({ search, status });
    renderTable(currentVisits);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('visits-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('visits')}</div>
          <h3>No visits found</h3>
          <p>Try a different filter, or open a new visit.</p>
          <button class="btn btn-primary" onclick="openVisitForm()">${Icons.render('plus')} New Visit</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Patient</th><th>Physician</th><th>Chief complaint</th><th>Date</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map(v => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openVisitDetail('${v.id}')">
                ${UI.escapeHtml(v.patient ? v.patient.full_name : '—')} <span class="cell-code">${v.patient ? v.patient.patient_code : ''}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(v.physician ? v.physician.full_name : '—')}</td>
              <td class="cell-muted">${UI.escapeHtml(v.chief_complaint)}</td>
              <td class="cell-muted">${UI.formatDateTime(v.visit_date)}</td>
              <td>${UI.visitStatusBadge(v.status)}</td>
              <td><button class="icon-btn" title="Open" onclick="openVisitDetail('${v.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- New visit modal ----------
function openVisitForm(patientId = null) {
  document.getElementById('visit-form').reset();
  if (patientId) document.getElementById('vf-patient').value = patientId;
  document.getElementById('visit-modal-backdrop').classList.add('visible');
}
function closeVisitForm() {
  document.getElementById('visit-modal-backdrop').classList.remove('visible');
}
document.getElementById('new-visit-btn').addEventListener('click', () => openVisitForm());
document.getElementById('visit-modal-close').addEventListener('click', closeVisitForm);
document.getElementById('visit-form-cancel').addEventListener('click', closeVisitForm);
document.getElementById('visit-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'visit-modal-backdrop') closeVisitForm();
});

document.getElementById('visit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    patient_id: document.getElementById('vf-patient').value,
    physician_id: document.getElementById('vf-physician').value,
    chief_complaint: document.getElementById('vf-complaint').value.trim(),
  };
  if (!payload.patient_id || !payload.physician_id || !payload.chief_complaint) {
    UI.toast('Please fill in patient, physician, and chief complaint.', 'danger');
    return;
  }
  const btn = document.getElementById('visit-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Opening…';
  try {
    await Api.visits.create(payload);
    UI.toast('Visit opened.');
    closeVisitForm();
    loadVisits();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Open Visit';
  }
});

// ---------- Visit detail / update modal ----------
async function openVisitDetail(id) {
  try {
    const [v, admissions, labOrders, prescriptions, referrals, sickLeaves, vitals] = await Promise.all([
      Api.visits.get(id),
      Api.admissions.list({ visit_id: id }),
      Api.labOrders.list({ visit_id: id }),
      Api.prescriptions.list({ visit_id: id }),
      Api.referrals.list({ visit_id: id }),
      Api.sickLeaves.list({ visit_id: id }),
      Api.vitals.list(id),
    ]);
    renderVisitDetail(v, admissions[0] || null, labOrders, prescriptions, referrals, sickLeaves, vitals);
    document.getElementById('visit-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderVisitDetail(v, admission, labOrders, prescriptions, referrals, sickLeaves, vitals) {
  document.getElementById('vd-title').textContent = v.patient ? v.patient.full_name : 'Visit';
  document.getElementById('vd-sub').textContent = `${v.patient ? v.patient.patient_code : ''} · ${UI.formatDateTime(v.visit_date)}`;

  const canEditClinical = v.status !== 'closed' && !isReceptionist;
  const canRecordVitals = v.status !== 'closed';

  function renderVitalValue(val, unit) {
    return val !== null && val !== undefined ? `<span class="vitals-value">${val}</span><span class="vitals-unit">${unit}</span>` : `<span class="vitals-value vitals-empty">—</span>`;
  }

  function renderVitalCard(vt) {
    const bp = (vt.blood_pressure_systolic && vt.blood_pressure_diastolic)
      ? `${vt.blood_pressure_systolic}/${vt.blood_pressure_diastolic}`
      : (vt.blood_pressure_systolic || vt.blood_pressure_diastolic || null);
    return `
      <div class="vitals-card">
        <div class="vitals-card-time">${Icons.render('clock')} ${UI.formatDateTime(vt.recorded_at)}</div>
        <div class="vitals-metrics">
          <div class="vitals-metric"><div class="vitals-label">Temp</div>${renderVitalValue(vt.temperature_c, '°C')}</div>
          <div class="vitals-metric"><div class="vitals-label">BP</div>${renderVitalValue(bp, 'mmHg')}</div>
          <div class="vitals-metric"><div class="vitals-label">Pulse</div>${renderVitalValue(vt.pulse_rate, '/min')}</div>
          <div class="vitals-metric"><div class="vitals-label">Resp</div>${renderVitalValue(vt.respiratory_rate, '/min')}</div>
          <div class="vitals-metric"><div class="vitals-label">Weight</div>${renderVitalValue(vt.weight_kg, 'kg')}</div>
          <div class="vitals-metric"><div class="vitals-label">Height</div>${renderVitalValue(vt.height_cm, 'cm')}</div>
        </div>
      </div>
    `;
  }

  document.getElementById('visit-detail-body').innerHTML = `
    <div class="detail-section">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px;">
        ${UI.visitStatusBadge(v.status)}
        <span class="text-muted" style="font-size:12px;">Attending: ${UI.escapeHtml(v.physician ? v.physician.full_name : '—')}</span>
      </div>
      <div class="detail-item" style="margin-top:10px;">
        <div class="k">Chief complaint</div>
        <div class="v" style="font-weight:500;">${UI.escapeHtml(v.chief_complaint)}</div>
      </div>
    </div>

    <div class="detail-section">
      <h4>${Icons.render('heartPulse')} Vitals (${vitals.length})</h4>
      <div id="vd-vitals-list">
        ${vitals.length ? vitals.map(renderVitalCard).join('') : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No vitals recorded for this visit yet.</p>`}
      </div>
      ${canRecordVitals ? `
        <button type="button" class="btn btn-secondary btn-sm" id="vd-vitals-toggle" style="margin-top:8px;">${Icons.render('plus')} Record Vitals</button>
        <div id="vd-vitals-form-wrap" style="display:none; margin-top:14px;">
          <div class="vitals-form-grid">
            <div class="field">
              <label for="vt-temp">Temperature (°C)</label>
              <input type="number" id="vt-temp" step="0.1" min="30" max="45" placeholder="e.g. 37.0" />
            </div>
            <div class="field">
              <label for="vt-bp-sys">BP Systolic</label>
              <input type="number" id="vt-bp-sys" min="40" max="300" placeholder="e.g. 120" />
            </div>
            <div class="field">
              <label for="vt-bp-dia">BP Diastolic</label>
              <input type="number" id="vt-bp-dia" min="20" max="200" placeholder="e.g. 80" />
            </div>
            <div class="field">
              <label for="vt-pulse">Pulse (/min)</label>
              <input type="number" id="vt-pulse" min="20" max="250" placeholder="e.g. 72" />
            </div>
            <div class="field">
              <label for="vt-resp">Resp. Rate (/min)</label>
              <input type="number" id="vt-resp" min="5" max="60" placeholder="e.g. 18" />
            </div>
            <div class="field">
              <label for="vt-weight">Weight (kg)</label>
              <input type="number" id="vt-weight" step="0.1" min="0.5" max="500" placeholder="e.g. 70.0" />
            </div>
            <div class="field">
              <label for="vt-height">Height (cm)</label>
              <input type="number" id="vt-height" step="0.1" min="20" max="250" placeholder="e.g. 170" />
            </div>
          </div>
          <div style="display:flex; gap:8px; margin-top:10px;">
            <button type="button" class="btn btn-primary btn-sm" id="vd-vitals-save">${Icons.render('check')} Save Reading</button>
            <button type="button" class="btn btn-secondary btn-sm" id="vd-vitals-cancel">Cancel</button>
          </div>
        </div>
      ` : ''}
    </div>

    <div class="detail-section">
      <h4>Examination</h4>
      <div class="field">
        <label for="vd-notes">Examination notes</label>
        <textarea id="vd-notes" rows="3" ${canEditClinical ? '' : 'disabled'}>${UI.escapeHtml(v.examination_notes || '')}</textarea>
      </div>
      <div class="field">
        <label for="vd-diagnosis">Diagnosis</label>
        <textarea id="vd-diagnosis" rows="2" ${canEditClinical ? '' : 'disabled'} placeholder="Required before diagnosis can be confirmed">${UI.escapeHtml(v.diagnosis || '')}</textarea>
      </div>
      <div class="field">
        <label for="vd-disposition">Disposition</label>
        <select id="vd-disposition" ${canEditClinical ? '' : 'disabled'}>
          <option value="">Not yet decided</option>
          <option value="discharged" ${v.disposition === 'discharged' ? 'selected' : ''}>Discharged</option>
          <option value="admitted" ${v.disposition === 'admitted' ? 'selected' : ''}>Admitted</option>
          <option value="referred" ${v.disposition === 'referred' ? 'selected' : ''}>Referred</option>
        </select>
        <div class="hint">Required before the visit can be closed.</div>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" id="vd-save-notes" ${canEditClinical ? '' : 'style="display:none;"'}>Save notes</button>
    </div>

    <div class="detail-section">
      <h4>Admission</h4>
      ${admission ? `
        <div class="notice notice-info">
          ${Icons.render('admissions')}
          <span>${UI.admissionStatusBadge(admission.status)} — <a href="admissions.html?open=${admission.id}" style="text-decoration:underline;">View admission record</a></span>
        </div>
      ` : v.disposition === 'admitted' ? `
        <div class="notice notice-warning">
          ${Icons.render('alert')}
          <span>Disposition is "Admitted" but no admission record exists yet. One is required before this visit can close.</span>
        </div>
        ${isReceptionist ? '' : `<a href="admissions.html?newFor=${v.id}" class="btn btn-secondary btn-sm">${Icons.render('plus')} Create Admission Record</a>`}
      ` : `<p class="text-muted" style="font-size:12.5px;">Not applicable unless disposition is set to "Admitted".</p>`}
    </div>

    <div class="detail-section">
      <h4>Lab orders (${labOrders.length})</h4>
      ${labOrders.length ? `
        <div class="timeline" style="margin-bottom:12px;">
          ${labOrders.map(o => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">${o.items.map(i => i.test ? UI.escapeHtml(i.test.code) : '?').join(', ')} ${UI.labOrderStatusBadge(o.status)}</div>
                <div class="d">${UI.formatDateTime(o.order_date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No lab tests ordered for this visit.</p>`}
      ${v.status !== 'closed' && !isReceptionist ? `<a href="laboratory.html?newFor=${v.id}" class="btn btn-secondary btn-sm">${Icons.render('plus')} Order Lab Tests</a>` : ''}
    </div>

    <div class="detail-section">
      <h4>Prescriptions (${prescriptions.length})</h4>
      ${prescriptions.length ? `
        <div class="timeline" style="margin-bottom:12px;">
          ${prescriptions.map(rx => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">${rx.items.map(i => i.drug ? UI.escapeHtml(i.drug.name) : '?').join(', ')} ${UI.prescriptionStatusBadge(rx.status)}</div>
                <div class="d">${UI.formatDateTime(rx.prescribed_date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No prescriptions written for this visit.</p>`}
      ${v.status !== 'closed' && !isReceptionist ? `<a href="pharmacy.html?newFor=${v.id}" class="btn btn-secondary btn-sm">${Icons.render('plus')} Write Prescription</a>` : ''}
    </div>

    <div class="detail-section">
      <h4>Referrals &amp; sick leave (${referrals.length + sickLeaves.length})</h4>
      ${(referrals.length || sickLeaves.length) ? `
        <div class="timeline" style="margin-bottom:12px;">
          ${referrals.map(r => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">Referred to ${UI.escapeHtml(r.referred_to)}</div>
                <div class="d">${UI.formatDateTime(r.referral_date)}</div>
              </div>
            </div>
          `).join('')}
          ${sickLeaves.map(s => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">Sick leave: ${UI.formatDate(s.leave_start)} — ${UI.formatDate(s.leave_end)}</div>
                <div class="d">Exam ${UI.formatDate(s.exam_date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No referrals or sick leave certificates for this visit.</p>`}
      ${v.status !== 'closed' && !isReceptionist ? `
        <div style="display:flex; gap:8px;">
          <a href="referrals.html?newFor=${v.id}" class="btn btn-secondary btn-sm">${Icons.render('plus')} New Referral</a>
          <a href="referrals.html?newFor=${v.id}&type=sickleave" class="btn btn-secondary btn-sm">${Icons.render('plus')} New Sick Leave</a>
        </div>
      ` : ''}
    </div>

    <div id="vd-block-notice"></div>
  `;


  if (canRecordVitals) {
    const toggleBtn = document.getElementById('vd-vitals-toggle');
    const formWrap = document.getElementById('vd-vitals-form-wrap');
    toggleBtn.addEventListener('click', () => {
      const visible = formWrap.style.display !== 'none';
      formWrap.style.display = visible ? 'none' : 'block';
      toggleBtn.style.display = visible ? '' : 'none';
    });
    document.getElementById('vd-vitals-cancel').addEventListener('click', () => {
      formWrap.style.display = 'none';
      toggleBtn.style.display = '';
    });
    document.getElementById('vd-vitals-save').addEventListener('click', async () => {
      const payload = {
        temperature_c: document.getElementById('vt-temp').value || null,
        blood_pressure_systolic: document.getElementById('vt-bp-sys').value || null,
        blood_pressure_diastolic: document.getElementById('vt-bp-dia').value || null,
        pulse_rate: document.getElementById('vt-pulse').value || null,
        respiratory_rate: document.getElementById('vt-resp').value || null,
        weight_kg: document.getElementById('vt-weight').value || null,
        height_cm: document.getElementById('vt-height').value || null,
      };
      const saveBtn = document.getElementById('vd-vitals-save');
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        await Api.vitals.create(v.id, payload);
        UI.toast('Vitals recorded.');
        // Refresh the vitals list in-place
        const updatedVitals = await Api.vitals.list(v.id);
        const listEl = document.getElementById('vd-vitals-list');
        listEl.innerHTML = updatedVitals.map(renderVitalCard).join('');
        formWrap.style.display = 'none';
        toggleBtn.style.display = '';
        // Reset form fields
        ['vt-temp','vt-bp-sys','vt-bp-dia','vt-pulse','vt-resp','vt-weight','vt-height'].forEach(id => document.getElementById(id).value = '');
      } catch (err) {
        UI.toast(UI.errorMessage(err), 'danger');
      } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `${Icons.render('check')} Save Reading`;
      }
    });
  }

  if (canEditClinical) {
    document.getElementById('vd-save-notes').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        await Api.visits.update(v.id, {
          examination_notes: document.getElementById('vd-notes').value,
          diagnosis: document.getElementById('vd-diagnosis').value,
          disposition: document.getElementById('vd-disposition').value || null,
        });
        UI.toast('Notes saved.');
        loadVisits();
      } catch (e2) {
        UI.toast(UI.errorMessage(e2), 'danger');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Save notes';
      }
    });
  }

  // footer: state-machine action button
  const footer = document.getElementById('visit-detail-footer');
  const next = isReceptionist ? null : NEXT_STATUS[v.status];
  if (!next) {
    const note = v.status === 'closed' ? 'This visit is closed.' : (isReceptionist ? 'Clinical status is managed by the attending physician.' : '');
    footer.innerHTML = `<span class="footer-note">${note}</span><button class="btn btn-secondary" id="vd-close-modal">Close</button>`;
  } else {
    footer.innerHTML = `
      <button class="btn btn-secondary" id="vd-close-modal">Close</button>
      <button class="btn btn-primary" id="vd-advance">${NEXT_STATUS_LABEL[next]}</button>
    `;
  }
  document.getElementById('vd-close-modal').addEventListener('click', closeVisitDetail);

  const advanceBtn = document.getElementById('vd-advance');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', async () => {
      const payload = { status: next };
      if (next === 'diagnosed') {
        const diagnosisVal = document.getElementById('vd-diagnosis').value.trim();
        if (!diagnosisVal) {
          UI.toast('Enter a diagnosis before confirming.', 'danger');
          return;
        }
        payload.diagnosis = diagnosisVal;
        payload.examination_notes = document.getElementById('vd-notes').value;
      }
      if (next === 'examined') {
        payload.examination_notes = document.getElementById('vd-notes').value;
      }
      if (next === 'closed') {
        const disp = document.getElementById('vd-disposition').value;
        if (!disp) {
          UI.toast('Select a disposition before closing the visit.', 'danger');
          return;
        }
        payload.disposition = disp;
      }
      advanceBtn.disabled = true;
      advanceBtn.innerHTML = '<span class="spinner"></span> Updating…';
      try {
        const updated = await Api.visits.update(v.id, payload);
        UI.toast(`Visit moved to "${updated.status}".`);
        const [full, admissions, labOrders, prescriptions, referrals, sickLeaves, vitals] = await Promise.all([
          Api.visits.get(v.id),
          Api.admissions.list({ visit_id: v.id }),
          Api.labOrders.list({ visit_id: v.id }),
          Api.prescriptions.list({ visit_id: v.id }),
          Api.referrals.list({ visit_id: v.id }),
          Api.sickLeaves.list({ visit_id: v.id }),
          Api.vitals.list(v.id),
        ]);
        renderVisitDetail(full, admissions[0] || null, labOrders, prescriptions, referrals, sickLeaves, vitals);
        loadVisits();
      } catch (e) {
        document.getElementById('vd-block-notice').innerHTML = `
          <div class="notice notice-warning">${Icons.render('alert')}<span>${UI.escapeHtml(UI.errorMessage(e))}</span></div>
        `;
        advanceBtn.disabled = false;
        advanceBtn.textContent = NEXT_STATUS_LABEL[next];
      }
    });
  }
}

function closeVisitDetail() {
  document.getElementById('visit-detail-backdrop').classList.remove('visible');
}
document.getElementById('visit-detail-close').addEventListener('click', closeVisitDetail);
document.getElementById('visit-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'visit-detail-backdrop') closeVisitDetail();
});

document.getElementById('search-input').addEventListener('input', debounce(loadVisits, 250));
document.getElementById('status-filter').addEventListener('change', loadVisits);

// ---------- init ----------
async function init() {
  await loadLookups();
  await loadVisits();

  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openVisitDetail(params.get('open'));
  if (params.get('newFor')) openVisitForm(params.get('newFor'));
}
init();
