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
const isReceptionist = typeof RoleGuard !== 'undefined' ? (RoleGuard.restrictedRole() === 'receptionist') : false;

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('visit-modal-close').innerHTML = Icons.render('close');
document.getElementById('visit-detail-close').innerHTML = Icons.render('close');

const newVisitBtn = document.getElementById('new-visit-btn');
if (newVisitBtn && typeof Permissions !== 'undefined') {
  newVisitBtn.style.display = Permissions.has('visits.create') ? 'inline-flex' : 'none';
}

let patientsCache = [];
let physiciansCache = [];
let currentVisits = [];
let isClinicalNotesDirty = false;

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
  
  const patientOptions = patientsCache.filter(p => p.is_active).map(p => ({
    value: p.id,
    label: `${p.full_name} (${p.patient_code})`,
    sublabel: `${p.department || 'General'} · ${p.phone || ''}`
  }));
  UI.makeSearchableSelect(patientSelect, patientOptions, 'Search patient by name or code…');

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
              <td>
                <div style="display:flex; gap:6px; align-items:center;">
                  <button class="icon-btn" title="Open Visit" onclick="openVisitDetail('${v.id}')">${Icons.render('eye')}</button>
                  ${Permissions.has('visits.delete') ? `<button class="icon-btn" title="Delete Visit" onclick="event.stopPropagation(); deleteVisit('${v.id}', '${UI.escapeHtml(v.patient ? v.patient.full_name : 'Patient')}')" style="color:var(--color-danger);">${Icons.render('trash')}</button>` : ''}
                </div>
              </td>
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

  isClinicalNotesDirty = false;
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
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:6px; flex-wrap:wrap;">
        ${UI.visitStatusBadge(v.status)}
        <div style="display:inline-flex; align-items:center; gap:6px; background:var(--color-bg-secondary); padding:4px 8px; border-radius:6px; border:1px solid var(--color-border-subtle);">
          <span class="text-muted" style="font-size:12px; font-weight:600;">Attending Physician:</span>
          ${v.status !== 'closed' ? `
            <select id="vd-physician-select" class="select-filter" style="padding:2px 6px; font-size:12px; height:26px;">
              ${physiciansCache.map(p => `<option value="${p.id}" ${v.physician && String(v.physician.id) === String(p.id) ? 'selected' : ''}>${UI.escapeHtml(p.full_name)}</option>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" id="vd-change-physician-btn" style="padding:2px 8px; font-size:11px;">Change</button>
          ` : `
            <strong style="font-size:12px;">${UI.escapeHtml(v.physician ? v.physician.full_name : 'Unassigned')}</strong>
          `}
        </div>
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
        <label for="vd-treatment">Treatment</label>
        <textarea id="vd-treatment" rows="2" ${canEditClinical ? '' : 'disabled'} placeholder="Prescribed treatment, medical procedures, or management plan">${UI.escapeHtml(v.treatment || '')}</textarea>
      </div>
      <div class="field">
        <label for="vd-hr-note">Note to HR / Physician Advice</label>
        <textarea id="vd-hr-note" rows="2" ${canEditClinical ? '' : 'disabled'} placeholder="Optional note directed to the HR department regarding fitness, light duty, etc.">${UI.escapeHtml(v.hr_note || '')}</textarea>
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
        ${isReceptionist ? '' : `<a href="admissions.html?newFor=${v.id}" class="btn btn-secondary btn-sm requires-saved-notes">${Icons.render('plus')} Create Admission Record</a>`}
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
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
                  <div class="t" style="margin-bottom:0;">Order ${UI.labOrderStatusBadge(o.status)}</div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div class="d">${UI.formatDateTime(o.order_date)}</div>
                    ${!isReceptionist ? `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Delete Lab Order" onclick="deleteLabOrderFromVisit('${o.id}', '${v.id}')">${Icons.render('trash')} Delete</button>` : ''}
                  </div>
                </div>
              <div class="table-wrap" style="box-shadow:none; border:1px solid var(--color-border-subtle); border-radius:4px; padding:0;">
                  <table class="data-table" style="font-size: 13px;">
                    <tbody>
                      ${o.items.map(i => `
                        <tr>
                          <td style="padding: 6px 12px; width:40%; color:var(--color-text-faint);">${i.test ? UI.escapeHtml(i.test.display_name) : '?'}</td>
                          <td style="padding: 6px 12px; font-weight:500;">${i.result_value ? UI.escapeHtml(i.result_value) : '<span class="text-muted" style="font-style:italic;">Pending</span>'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>
                </div>
                ${(o.physician_note || o.technician_note) ? `
                  <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                    ${o.physician_note ? `
                      <div style="background:var(--color-info-light); border:1px solid var(--color-info); border-left:4px solid var(--color-info); border-radius:8px; padding:9px 12px; font-size:13px;">
                        <div style="font-size:11px; font-weight:700; color:var(--color-info); text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px;">
                          ${UI.escapeHtml(o.physician_full_name || (physiciansCache.find(p => String(p.id) === String(o.physician_id))?.full_name) || 'Physician')}:
                        </div>
                        <div style="white-space:pre-wrap; color:var(--color-text);">${UI.escapeHtml(o.physician_note)}</div>
                      </div>
                    ` : ''}
                    ${o.technician_note ? `
                      <div style="background:var(--color-accent-light); border:1px solid var(--color-accent); border-left:4px solid var(--color-accent); border-radius:8px; padding:9px 12px; font-size:13px;">
                        <div style="font-size:11px; font-weight:700; color:var(--color-accent); text-transform:uppercase; letter-spacing:.04em; margin-bottom:4px;">
                          ${UI.escapeHtml(o.technician_name || 'Lab Technician')}:
                        </div>
                        <div style="white-space:pre-wrap; color:var(--color-text);">${UI.escapeHtml(o.technician_note)}</div>
                      </div>
                    ` : ''}
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No lab tests ordered for this visit.</p>`}
      ${v.status !== 'closed' && !isReceptionist ? `<a href="laboratory.html?newFor=${v.id}" class="btn btn-secondary btn-sm requires-saved-notes">${Icons.render('plus')} Order Lab Tests</a>` : ''}
    </div>

    <div class="detail-section">
      <h4>Prescriptions (${prescriptions.length})</h4>
      ${prescriptions.length ? `
        <div class="timeline" style="margin-bottom:12px;">
          ${prescriptions.map(rx => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div class="t">${rx.items.map(i => i.drug ? UI.escapeHtml(i.drug.name) : '?').join(', ')} ${UI.prescriptionStatusBadge(rx.status)}</div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-primary); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Print Prescription" onclick="printPrescription('${rx.id}', event)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print
                    </button>
                    ${!isReceptionist ? `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Delete Prescription" onclick="deletePrescriptionFromVisit('${rx.id}', '${v.id}')">${Icons.render('trash')} Delete</button>` : ''}
                  </div>
                </div>
                <div class="d">${UI.formatDateTime(rx.prescribed_date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No prescriptions written for this visit.</p>`}
      ${v.status !== 'closed' && !isReceptionist ? `<a href="pharmacy.html?newFor=${v.id}" class="btn btn-secondary btn-sm requires-saved-notes">${Icons.render('plus')} Write Prescription</a>` : ''}
    </div>


    <div class="detail-section">
      <h4>Referrals &amp; sick leave (${referrals.length + sickLeaves.length})</h4>
      ${(referrals.length || sickLeaves.length) ? `
        <div class="timeline" style="margin-bottom:12px;">
          ${referrals.map(r => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div class="t">Referred to ${UI.escapeHtml(r.referred_to)}</div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-primary); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Print Referral" onclick="printReferral('${r.id}', event)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print
                    </button>
                    ${!isReceptionist ? `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Delete Referral" onclick="deleteReferralFromVisit('${r.id}', '${v.id}')">${Icons.render('trash')} Delete</button>` : ''}
                  </div>
                </div>
                <div class="d">${UI.formatDateTime(r.referral_date)}</div>
              </div>
            </div>
          `).join('')}
          ${sickLeaves.map(s => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div class="t">Sick leave: ${UI.formatDate(s.leave_start)} — ${UI.formatDate(s.leave_end)}</div>
                  <div style="display:flex; align-items:center; gap:4px;">
                    <button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-primary); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Print Sick Leave" onclick="printSickLeave('${s.id}', event)">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Print
                    </button>
                    ${!isReceptionist ? `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--color-danger); padding:2px 6px; font-size:11px; display:inline-flex; align-items:center; gap:3px;" title="Delete Sick Leave" onclick="deleteSickLeaveFromVisit('${s.id}', '${v.id}')">${Icons.render('trash')} Delete</button>` : ''}
                  </div>
                </div>
                <div class="d">Exam ${UI.formatDate(s.exam_date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px; margin-bottom:12px;">No referrals or sick leave certificates for this visit.</p>`}
      ${v.status !== 'closed' && !isReceptionist ? `
        <div style="display:flex; gap:8px;">
          <a href="referrals.html?newFor=${v.id}" class="btn btn-secondary btn-sm requires-saved-notes">${Icons.render('plus')} New Referral</a>
          <a href="referrals.html?newFor=${v.id}&type=sickleave" class="btn btn-secondary btn-sm requires-saved-notes">${Icons.render('plus')} New Sick Leave</a>
        </div>
      ` : ''}
    </div>


    <div id="vd-block-notice"></div>
  `;

  document.getElementById('visit-detail-body').querySelectorAll('.requires-saved-notes').forEach(el => {
    el.addEventListener('click', (e) => {
      if (isClinicalNotesDirty) {
        e.preventDefault();
        UI.toast('Please save your notes before continuing!', 'danger');
      }
    });
  });

  const changePhysBtn = document.getElementById('vd-change-physician-btn');
  if (changePhysBtn) {
    changePhysBtn.addEventListener('click', async () => {
      const newPhysId = document.getElementById('vd-physician-select').value;
      if (!newPhysId) return;
      changePhysBtn.disabled = true;
      changePhysBtn.innerHTML = '<span class="spinner"></span>';
      try {
        await Api.visits.update(v.id, { physician_id: newPhysId });
        UI.toast('Attending physician updated for this visit & associated orders.');
        await openVisitDetail(v.id);
        await loadVisits();
      } catch (err) {
        UI.toast(UI.errorMessage(err), 'danger');
        changePhysBtn.disabled = false;
        changePhysBtn.textContent = 'Change';
      }
    });
  }


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
    const markDirty = () => { isClinicalNotesDirty = true; };
    document.getElementById('vd-notes').addEventListener('input', markDirty);
    document.getElementById('vd-diagnosis').addEventListener('input', markDirty);
    document.getElementById('vd-treatment').addEventListener('input', markDirty);
    document.getElementById('vd-hr-note').addEventListener('input', markDirty);
    document.getElementById('vd-disposition').addEventListener('change', markDirty);

    document.getElementById('vd-save-notes').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        await Api.visits.update(v.id, {
          examination_notes: document.getElementById('vd-notes').value,
          diagnosis: document.getElementById('vd-diagnosis').value,
          treatment: document.getElementById('vd-treatment').value,
          hr_note: document.getElementById('vd-hr-note').value,
          disposition: document.getElementById('vd-disposition').value || null,
        });
        UI.toast('Notes saved.');
        isClinicalNotesDirty = false;
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
  const regId = v.patient ? v.patient.source_employee_registration_id : null;
  const isCertEligible = !isReceptionist && (regId || v.visit_type === 'periodic_renewal' || (v.chief_complaint && (v.chief_complaint.toLowerCase().includes('medical examination') || v.chief_complaint.toLowerCase().includes('renewal'))));

  const certBtnHtml = isCertEligible ? `<button class="btn btn-secondary" id="vd-record-cert-btn" style="border-color:var(--color-primary); color:var(--color-primary);">${Icons.render('filecheck')} Record Certificate</button>` : '';

  const deleteBtnHtml = `<button type="button" class="btn btn-danger" id="vd-delete-btn" style="margin-right:auto; background-color:#dc3545; color:white;">${Icons.render('trash')} Delete Visit</button>`;

  if (!next) {
    const note = v.status === 'closed' ? 'This visit is closed.' : (isReceptionist ? 'Clinical status is managed by the attending physician.' : '');
    footer.innerHTML = `
      ${deleteBtnHtml}
      <span class="footer-note">${note}</span>
      ${certBtnHtml}
      <button class="btn btn-secondary" id="vd-close-modal">Close</button>
    `;
  } else {
    footer.innerHTML = `
      ${deleteBtnHtml}
      <button class="btn btn-secondary" id="vd-close-modal">Close</button>
      ${certBtnHtml}
      <button class="btn btn-primary" id="vd-advance">${NEXT_STATUS_LABEL[next]}</button>
    `;
  }
  document.getElementById('vd-close-modal').addEventListener('click', closeVisitDetail);

  const deleteBtn = document.getElementById('vd-delete-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => deleteVisit(v.id, v.patient ? v.patient.full_name : 'Patient'));
  }

  const recordCertBtn = document.getElementById('vd-record-cert-btn');
  if (recordCertBtn) {
    recordCertBtn.addEventListener('click', async () => {
      const payload = {
        hr_note: document.getElementById('vd-hr-note').value,
        treatment: document.getElementById('vd-treatment').value,
        examination_notes: document.getElementById('vd-notes').value
      };
      if (document.getElementById('vd-diagnosis')) {
        const diag = document.getElementById('vd-diagnosis').value.trim();
        if (diag) payload.diagnosis = diag;
      }
      try {
        await Api.visits.update(v.id, payload);
      } catch (e) {}

      UI.toast('Opening Medical Certification form…');
      setTimeout(() => {
        const query = regId ? `regId=${regId}&visitId=${v.id}` : `visitId=${v.id}`;
        window.location.href = `certifications.html?${query}`;
      }, 300);
    });
  }

  const advanceBtn = document.getElementById('vd-advance');
  if (advanceBtn) {
    advanceBtn.addEventListener('click', async () => {
      if (isClinicalNotesDirty) {
        UI.toast('Please save your notes before continuing!', 'danger');
        return;
      }
      const payload = { 
        status: next,
        hr_note: document.getElementById('vd-hr-note').value,
        treatment: document.getElementById('vd-treatment').value
      };
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

async function deleteVisit(id, patientName = 'this visit') {
  if (!confirm(`Are you sure you want to delete the clinical visit for ${patientName}? All associated vitals, lab orders, prescriptions, and notes for this visit will be permanently removed.`)) {
    return;
  }
  try {
    await Api.visits.delete(id);
    UI.toast('Visit deleted successfully.');
    closeVisitDetail();
    await loadVisits();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

window.deleteLabOrderFromVisit = async function(orderId, visitId) {
  if (!confirm('Are you sure you want to delete this lab order? It will be removed from this visit and the laboratory queue.')) return;
  try {
    await Api.labOrders.delete(orderId);
    UI.toast('Lab order deleted.');
    await openVisitDetail(visitId);
    await loadVisits();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};

window.deletePrescriptionFromVisit = async function(rxId, visitId) {
  if (!confirm('Are you sure you want to delete this prescription? Any dispensed quantities will be restored to pharmacy inventory and it will be removed from this visit.')) return;
  try {
    await Api.prescriptions.delete(rxId);
    UI.toast('Prescription deleted.');
    await openVisitDetail(visitId);
    await loadVisits();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};

window.deleteReferralFromVisit = async function(refId, visitId) {
  if (!confirm('Are you sure you want to delete this referral? It will be removed from this visit.')) return;
  try {
    await Api.referrals.delete(refId);
    UI.toast('Referral deleted.');
    await openVisitDetail(visitId);
    await loadVisits();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};

window.deleteSickLeaveFromVisit = async function(slId, visitId) {
  if (!confirm('Are you sure you want to delete this sick leave certificate? It will be removed from this visit and HR portal records.')) return;
  try {
    await Api.sickLeaves.delete(slId);
    UI.toast('Sick leave certificate deleted.');
    await openVisitDetail(visitId);
    await loadVisits();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
};

window.printPrescription = async function(id, event) {
  if (event) event.stopPropagation();
  try {
    const rx = await Api.prescriptions.get(id);
    if (typeof PrintDoc !== 'undefined') {
      PrintDoc.prescription(rx);
    } else {
      window.print();
    }
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
};

window.printReferral = async function(id, event) {
  if (event) event.stopPropagation();
  try {
    const r = await Api.referrals.get(id);
    if (typeof PrintDoc !== 'undefined') {
      PrintDoc.referral(r);
    } else {
      window.print();
    }
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
};

window.printSickLeave = async function(id, event) {
  if (event) event.stopPropagation();
  try {
    const s = await Api.sickLeaves.get(id);
    if (typeof PrintDoc !== 'undefined') {
      PrintDoc.sickLeave(s);
    } else {
      window.print();
    }
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
};

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

  setInterval(() => {
    const activeBackdrop = document.querySelector('.modal-backdrop.visible');
    if (!activeBackdrop) {
      loadVisits();
    }
  }, 10000);
}
init();
