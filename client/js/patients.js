/* ===========================================================
   Patients page logic
   =========================================================== */

Auth.requireAuth();
renderShell('patients');
setPageTitle('Patients');

const restrictedRole = RoleGuard.restrictedRole();

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('patient-modal-close').innerHTML = Icons.render('close');
document.getElementById('patient-detail-close').innerHTML = Icons.render('close');

if (restrictedRole) {
  document.getElementById('new-patient-btn').style.display = 'none';
}

let currentList = [];
let editingId = null;

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadPatients() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    currentList = await Api.patients.list({ search, status });
    renderTable(currentList);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('patients-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('patients')}</div>
          <h3>No patients found</h3>
          <p>${restrictedRole ? 'Try a different search.' : 'Try a different search, or register a new patient.'}</p>
          ${restrictedRole ? '' : `<button class="btn btn-primary" onclick="openPatientForm()">${Icons.render('plus')} New Patient</button>`}
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Code</th><th>Full name</th><th>Gender</th><th>Age</th><th>Phone</th><th>Registered</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(p => `
            <tr>
              <td><span class="cell-code">${p.patient_code}</span></td>
              <td class="cell-primary" style="cursor:pointer;" onclick="openPatientDetail('${p.id}')">${UI.escapeHtml(p.full_name)}</td>
              <td class="cell-muted" style="text-transform:capitalize;">${p.gender || '—'}</td>
              <td class="cell-muted">${UI.age(p.date_of_birth)}</td>
              <td class="cell-muted">${UI.escapeHtml(p.phone) || '—'}</td>
              <td class="cell-muted">${UI.formatDate(p.registered_date)}</td>
              <td>${UI.patientStatusBadge(p.is_active)}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="View" onclick="openPatientDetail('${p.id}')">${Icons.render('eye')}</button>
                  ${restrictedRole ? '' : `<button class="icon-btn" title="Edit" onclick="openPatientForm('${p.id}')">${Icons.render('edit')}</button>`}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- Add / Edit modal ----------
async function openPatientForm(id = null) {
  if (restrictedRole) return;
  editingId = id;
  const backdrop = document.getElementById('patient-modal-backdrop');
  const form = document.getElementById('patient-form');
  form.reset();
  document.getElementById('patient-form-note').textContent = '';

  if (id) {
    let p;
    try {
      p = await Api.patients.get(id);
    } catch (e) {
      UI.toast(UI.errorMessage(e), 'danger');
      return;
    }
    document.getElementById('patient-modal-title').textContent = 'Edit Patient';
    document.getElementById('patient-modal-sub').textContent = `Update details for ${p.patient_code}.`;
    document.getElementById('pf-full-name').value = p.full_name || '';
    document.getElementById('pf-dob').value = p.date_of_birth || '';
    document.getElementById('pf-gender').value = p.gender || '';
    document.getElementById('pf-phone').value = p.phone || '';
    document.getElementById('pf-location').value = p.location || '';
    document.getElementById('pf-address').value = p.address || '';
  } else {
    document.getElementById('patient-modal-title').textContent = 'New Patient';
    document.getElementById('patient-modal-sub').textContent = 'Add a walk-in patient to the clinic register.';
    document.getElementById('patient-form-note').textContent = 'A patient code (S0xx) will be assigned automatically.';
  }
  backdrop.classList.add('visible');
}

function closePatientForm() {
  document.getElementById('patient-modal-backdrop').classList.remove('visible');
  editingId = null;
}

document.getElementById('new-patient-btn').addEventListener('click', () => openPatientForm());
document.getElementById('patient-modal-close').addEventListener('click', closePatientForm);
document.getElementById('patient-form-cancel').addEventListener('click', closePatientForm);
document.getElementById('patient-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'patient-modal-backdrop') closePatientForm();
});

document.getElementById('patient-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    full_name: document.getElementById('pf-full-name').value.trim(),
    date_of_birth: document.getElementById('pf-dob').value || null,
    gender: document.getElementById('pf-gender').value || null,
    phone: document.getElementById('pf-phone').value.trim(),
    location: document.getElementById('pf-location').value.trim(),
    address: document.getElementById('pf-address').value.trim(),
  };
  const btn = document.getElementById('patient-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    if (editingId) {
      await Api.patients.update(editingId, payload);
      UI.toast('Patient updated.');
    } else {
      const created = await Api.patients.create(payload);
      UI.toast(`Patient ${created.patient_code} registered.`);
    }
    closePatientForm();
    loadPatients();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Patient';
  }
});

// ---------- Detail modal ----------
async function openPatientDetail(id) {
  try {
    const p = await Api.patients.get(id);
    document.getElementById('pd-name').textContent = p.full_name;
    document.getElementById('pd-code').textContent = `${p.patient_code} · registered ${UI.formatDate(p.registered_date)}`;

    if (restrictedRole) {
      await renderRestrictedPatientDetail(p);
    } else {
      renderFullPatientDetail(p);
    }

    document.getElementById('patient-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderFullPatientDetail(p) {
  document.getElementById('patient-detail-body').innerHTML = `
    <div class="detail-section">
      <h4>Patient information</h4>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Gender</div><div class="v" style="text-transform:capitalize;">${p.gender || '—'}</div></div>
        <div class="detail-item"><div class="k">Age</div><div class="v">${UI.age(p.date_of_birth)}</div></div>
        <div class="detail-item"><div class="k">Phone</div><div class="v">${UI.escapeHtml(p.phone) || '—'}</div></div>
        <div class="detail-item"><div class="k">Status</div><div class="v">${UI.patientStatusBadge(p.is_active)}</div></div>
        <div class="detail-item"><div class="k">Location</div><div class="v">${UI.escapeHtml(p.location) || '—'}</div></div>
        <div class="detail-item"><div class="k">Address</div><div class="v">${UI.escapeHtml(p.address) || '—'}</div></div>
      </div>
      ${p.source_employee_registration_id ? `
        <div class="notice notice-info" style="margin-top:14px;">
          ${Icons.render('info')}
          <span>This patient originated as a pre-employment candidate (${p.source_employee_registration_id}) who was hired. That record is preserved permanently in Employee Registrations.</span>
        </div>` : ''}
    </div>
    <div class="detail-section">
      <h4>Visit history (${p.visits.length})</h4>
      ${p.visits.length ? `
        <div class="timeline">
          ${p.visits.map(v => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">${UI.escapeHtml(v.chief_complaint)} ${UI.visitStatusBadge(v.status)}</div>
                <div class="d">${UI.formatDateTime(v.visit_date)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px;">No visits recorded yet.</p>`}
    </div>
  `;
  document.getElementById('pd-edit-btn').style.display = 'inline-flex';
  document.getElementById('pd-new-visit-btn').style.display = 'inline-flex';
  document.getElementById('pd-edit-btn').onclick = () => { closePatientDetail(); openPatientForm(p.id); };
  document.getElementById('pd-new-visit-btn').onclick = () => { window.location.href = `visits.html?newFor=${p.id}`; };
}

// Lab techs and pharmacists get identity info plus only the work items
// tied to their own department — no clinical notes/diagnosis, no edit
// or visit-creation actions, no hire-lineage/HR details.
async function renderRestrictedPatientDetail(p) {
  const visitIds = new Set(p.visits.map(v => v.id));
  const baseInfo = `
    <div class="detail-section">
      <h4>Patient information</h4>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Gender</div><div class="v" style="text-transform:capitalize;">${p.gender || '—'}</div></div>
        <div class="detail-item"><div class="k">Age</div><div class="v">${UI.age(p.date_of_birth)}</div></div>
        <div class="detail-item"><div class="k">Phone</div><div class="v">${UI.escapeHtml(p.phone) || '—'}</div></div>
        <div class="detail-item"><div class="k">Status</div><div class="v">${UI.patientStatusBadge(p.is_active)}</div></div>
      </div>
    </div>
  `;

  let workSectionHtml = '';
  if (restrictedRole === 'lab_technician') {
    const allOrders = await Api.labOrders.list();
    const orders = allOrders.filter(o => visitIds.has(o.visit_id));
    workSectionHtml = `
      <div class="detail-section">
        <h4>Lab orders (${orders.length})</h4>
        ${orders.length ? `
          <div class="timeline">
            ${orders.map(o => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-body">
                  <div class="t" style="cursor:pointer;" onclick="window.location.href='laboratory.html?open=${o.id}'">
                    ${o.items.map(i => i.test ? UI.escapeHtml(i.test.code) : '?').join(', ')} ${UI.labOrderStatusBadge(o.status)}
                  </div>
                  <div class="d">${UI.formatDateTime(o.order_date)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<p class="text-muted" style="font-size:12.5px;">No lab orders for this patient.</p>`}
      </div>
    `;
  } else if (restrictedRole === 'pharmacist') {
    const allRx = await Api.prescriptions.list();
    const prescriptions = allRx.filter(rx => visitIds.has(rx.visit_id));
    workSectionHtml = `
      <div class="detail-section">
        <h4>Prescriptions (${prescriptions.length})</h4>
        ${prescriptions.length ? `
          <div class="timeline">
            ${prescriptions.map(rx => `
              <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-body">
                  <div class="t" style="cursor:pointer;" onclick="window.location.href='pharmacy.html?open=${rx.id}'">
                    ${rx.items.map(i => i.drug ? UI.escapeHtml(i.drug.name) : '?').join(', ')} ${UI.prescriptionStatusBadge(rx.status)}
                  </div>
                  <div class="d">${UI.formatDateTime(rx.prescribed_date)}</div>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<p class="text-muted" style="font-size:12.5px;">No prescriptions for this patient.</p>`}
      </div>
    `;
  }

  document.getElementById('patient-detail-body').innerHTML = baseInfo + workSectionHtml;
  document.getElementById('pd-edit-btn').style.display = 'none';
  document.getElementById('pd-new-visit-btn').style.display = 'none';
}

function closePatientDetail() {
  document.getElementById('patient-detail-backdrop').classList.remove('visible');
}
document.getElementById('patient-detail-close').addEventListener('click', closePatientDetail);
document.getElementById('patient-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'patient-detail-backdrop') closePatientDetail();
});

document.getElementById('search-input').addEventListener('input', debounce(loadPatients, 250));
document.getElementById('status-filter').addEventListener('change', loadPatients);

async function init() {
  await loadPatients();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openPatientDetail(params.get('open'));
}
init();
