/* ===========================================================
   Admissions page logic
   -----------------------------------------------------------
   Admissions are mock-only until the real backend route exists
   (see BACKEND_HANDOFF.md). Visits/patients/physicians come
   from the real API; this page joins them client-side.
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('admissions')) { throw new Error('redirecting'); }
renderShell('admissions');
setPageTitle('Admissions');

document.getElementById('header-info-icon').innerHTML = Icons.render('info');
document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('adm-modal-close').innerHTML = Icons.render('close');
document.getElementById('adm-detail-close').innerHTML = Icons.render('close');

let physiciansCache = [];
let visitsCache = [];
let admissionsCache = [];
let eligibleVisits = [];

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function physicianName(id) {
  const p = physiciansCache.find(x => String(x.id) === String(id));
  return p ? p.full_name : '—';
}

async function loadLookups() {
  [physiciansCache, visitsCache, admissionsCache] = await Promise.all([
    Api.physicians.list(),
    Api.visits.list(),
    Api.admissions.list(),
  ]);

  eligibleVisits = visitsCache.filter(v =>
    v.disposition === 'admitted' && !admissionsCache.some(a => String(a.visit_id) === String(v.id))
  );

  document.getElementById('af-physician').innerHTML = `<option value="">Select…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');

  const visitSelect = document.getElementById('af-visit');
  if (!eligibleVisits.length) {
    visitSelect.innerHTML = `<option value="">No eligible visits</option>`;
  } else {
    visitSelect.innerHTML = `<option value="">Select a visit…</option>` +
      eligibleVisits.map(v => `<option value="${v.id}">${UI.escapeHtml(v.patient ? v.patient.full_name : '')} — ${v.patient ? v.patient.patient_code : ''} · ${UI.formatDate(v.visit_date)}</option>`).join('');

    const visitOptions = eligibleVisits.map(v => ({
      value: v.id,
      label: `${v.patient ? v.patient.full_name : 'Patient'} (${v.patient ? v.patient.patient_code : ''})`,
      sublabel: `${UI.escapeHtml(v.chief_complaint || 'Visit')} · ${UI.formatDate(v.visit_date)}`
    }));
    UI.makeSearchableSelect(visitSelect, visitOptions, 'Search patient by name or code…');
  }
}

async function loadAdmissions() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    admissionsCache = await Api.admissions.list({ search, status });
    renderTable(admissionsCache);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('admissions-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('admissions')}</div>
          <h3>No admissions found</h3>
          <p>Try a different filter, or admit a patient from an eligible visit.</p>
          <button class="btn btn-primary" onclick="openAdmForm()">${Icons.render('plus')} New Admission</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead><tr><th>Patient</th><th>Admitting physician</th><th>Admitted</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${list.map(a => `
            <tr>
              <td class="cell-primary" style="cursor:pointer;" onclick="openAdmDetail('${a.id}')">
                ${UI.escapeHtml(a.patient_name)} <span class="cell-code">${UI.escapeHtml(a.patient_code)}</span>
              </td>
              <td class="cell-muted">${UI.escapeHtml(physicianName(a.admitting_physician_id))}</td>
              <td class="cell-muted">${UI.formatDateTime(a.admitted_at)}</td>
              <td class="cell-muted">${UI.escapeHtml(a.reason)}</td>
              <td>${UI.admissionStatusBadge(a.status)}</td>
              <td><button class="icon-btn" title="View" onclick="openAdmDetail('${a.id}')">${Icons.render('eye')}</button></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- New admission ----------
function openAdmForm(visitId = null) {
  if (!eligibleVisits.length) {
    UI.toast('No visits are currently eligible for admission.', 'danger');
    return;
  }
  document.getElementById('adm-form').reset();
  if (visitId) document.getElementById('af-visit').value = visitId;
  document.getElementById('adm-modal-backdrop').classList.add('visible');
}
function closeAdmForm() {
  document.getElementById('adm-modal-backdrop').classList.remove('visible');
}
document.getElementById('new-admission-btn').addEventListener('click', () => openAdmForm());
document.getElementById('adm-modal-close').addEventListener('click', closeAdmForm);
document.getElementById('adm-form-cancel').addEventListener('click', closeAdmForm);
document.getElementById('adm-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'adm-modal-backdrop') closeAdmForm();
});

document.getElementById('adm-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const visitId = document.getElementById('af-visit').value;
  const visit = eligibleVisits.find(v => String(v.id) === String(visitId));
  if (!visit) {
    UI.toast('Select a valid visit.', 'danger');
    return;
  }
  const payload = {
    visit_id: visit.id,
    patient_id: visit.patient_id,
    patient_name: visit.patient.full_name,
    patient_code: visit.patient.patient_code,
    admitting_physician_id: document.getElementById('af-physician').value,
    reason: document.getElementById('af-reason').value.trim(),
  };
  if (!payload.admitting_physician_id || !payload.reason) {
    UI.toast('Select an admitting physician and enter a reason.', 'danger');
    return;
  }
  const btn = document.getElementById('adm-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Admitting…';
  try {
    await Api.admissions.create(payload);
    UI.toast(`${visit.patient.full_name} admitted.`);
    closeAdmForm();
    await loadLookups();
    await loadAdmissions();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Admit Patient';
  }
});

// ---------- Detail ----------
async function openAdmDetail(id) {
  try {
    const a = await Api.admissions.get(id);
    const visit = visitsCache.find(v => String(v.id) === String(a.visit_id));
    renderAdmDetail(a, visit);
    document.getElementById('adm-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderAdmDetail(a, visit) {
  document.getElementById('ad-name').textContent = a.patient_name;
  document.getElementById('ad-sub').textContent = `${a.patient_code} · admitted ${UI.formatDateTime(a.admitted_at)}`;

  document.getElementById('adm-detail-body').innerHTML = `
    <div class="detail-section">
      <div style="margin-bottom:10px;">${UI.admissionStatusBadge(a.status)}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Admitting physician</div><div class="v">${UI.escapeHtml(physicianName(a.admitting_physician_id))}</div></div>
        <div class="detail-item"><div class="k">Originating visit</div><div class="v">${visit ? `<a href="visits.html?open=${visit.id}" style="text-decoration:underline;">View visit</a>` : '—'}</div></div>
        <div class="detail-item" style="grid-column:1/-1;"><div class="k">Reason</div><div class="v" style="font-weight:500;">${UI.escapeHtml(a.reason)}</div></div>
        ${a.status === 'discharged' ? `
          <div class="detail-item"><div class="k">Discharged</div><div class="v">${UI.formatDateTime(a.discharged_at)}</div></div>
          <div class="detail-item" style="grid-column:1/-1;"><div class="k">Discharge notes</div><div class="v" style="font-weight:500;">${UI.escapeHtml(a.discharge_notes) || '—'}</div></div>
        ` : ''}
      </div>
    </div>
    <div class="detail-section">
      <h4>Daily notes (${a.notes.length})</h4>
      <div class="field" style="margin-bottom:12px;">
        <textarea id="ad-note-input" rows="2" placeholder="Add a note…" ${a.status === 'discharged' ? 'disabled' : ''}></textarea>
      </div>
      ${a.status !== 'discharged' ? `<button type="button" class="btn btn-secondary btn-sm" id="ad-add-note-btn" style="margin-bottom:14px;">${Icons.render('plus')} Add Note</button>` : ''}
      ${a.notes.length ? `
        <div class="timeline">
          ${a.notes.map(n => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">${UI.escapeHtml(n.note)}</div>
                <div class="d">${UI.formatDateTime(n.recorded_at)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px;">No notes recorded yet.</p>`}
    </div>
  `;

  if (a.status !== 'discharged') {
    document.getElementById('ad-add-note-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const text = document.getElementById('ad-note-input').value.trim();
      if (!text) { UI.toast('Enter a note first.', 'danger'); return; }
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving…';
      try {
        await Api.admissions.addNote(a.id, text);
        UI.toast('Note added.');
        openAdmDetail(a.id);
      } catch (err) {
        UI.toast(UI.errorMessage(err), 'danger');
        btn.disabled = false;
        btn.innerHTML = `${Icons.render('plus')} Add Note`;
      }
    });
  }

  const footer = document.getElementById('adm-detail-footer');
  if (a.status === 'admitted') {
    footer.innerHTML = `
      <button class="btn btn-secondary" id="adm-close-modal">Close</button>
      <button class="btn btn-primary" id="ad-discharge-btn">Discharge Patient</button>
    `;
    document.getElementById('ad-discharge-btn').addEventListener('click', async (e) => {
      const notes = prompt('Discharge notes (optional):', '') || '';
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Discharging…';
      try {
        await Api.admissions.discharge(a.id, notes);
        UI.toast('Patient discharged.');
        closeAdmDetail();
        await loadLookups();
        await loadAdmissions();
      } catch (err) {
        UI.toast(UI.errorMessage(err), 'danger');
        btn.disabled = false;
        btn.textContent = 'Discharge Patient';
      }
    });
  } else {
    footer.innerHTML = `<span class="footer-note">This patient has been discharged.</span><button class="btn btn-secondary" id="adm-close-modal">Close</button>`;
  }
  document.getElementById('adm-close-modal').addEventListener('click', closeAdmDetail);
}

function closeAdmDetail() {
  document.getElementById('adm-detail-backdrop').classList.remove('visible');
}
document.getElementById('adm-detail-close').addEventListener('click', closeAdmDetail);
document.getElementById('adm-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'adm-detail-backdrop') closeAdmDetail();
});

document.getElementById('search-input').addEventListener('input', debounce(loadAdmissions, 250));
document.getElementById('status-filter').addEventListener('change', loadAdmissions);

async function init() {
  await loadLookups();
  await loadAdmissions();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openAdmDetail(params.get('open'));
  if (params.get('newFor')) openAdmForm(params.get('newFor'));
}
init();
