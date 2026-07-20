/* ===========================================================
   Visits page logic
   =========================================================== */

Auth.requireAuth();
renderShell('visits');
setPageTitle('Visits');

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
    const v = await Api.visits.get(id);
    renderVisitDetail(v);
    document.getElementById('visit-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderVisitDetail(v) {
  document.getElementById('vd-title').textContent = v.patient ? v.patient.full_name : 'Visit';
  document.getElementById('vd-sub').textContent = `${v.patient ? v.patient.patient_code : ''} · ${UI.formatDateTime(v.visit_date)}`;

  const canEditClinical = v.status !== 'closed';

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

    <div id="vd-block-notice"></div>
  `;

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
  const next = NEXT_STATUS[v.status];
  if (!next) {
    footer.innerHTML = `<span class="footer-note">This visit is closed.</span><button class="btn btn-secondary" id="vd-close-modal">Close</button>`;
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
        const full = await Api.visits.get(v.id);
        renderVisitDetail(full);
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
