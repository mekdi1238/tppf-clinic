/* ===========================================================
   Patients page logic
   =========================================================== */

Auth.requireAuth();
renderShell('patients');
setPageTitle('Patients');

const restrictedRole = RoleGuard.restrictedRole();
const perms = {
  create: typeof Permissions !== 'undefined' ? Permissions.has('patients.create') : true,
  edit: typeof Permissions !== 'undefined' ? Permissions.has('patients.edit') : true,
  visitHistory: typeof Permissions !== 'undefined'
    ? (Permissions.has('patients.view_history') ? 'full' : (restrictedRole ? 'department' : 'full'))
    : 'full',
  canStartVisit: typeof Permissions !== 'undefined' ? Permissions.has('visits.create') : true,
};

document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('patient-modal-close').innerHTML = Icons.render('close');
document.getElementById('patient-detail-close').innerHTML = Icons.render('close');

const downloadIconEl = document.getElementById('download-icon-slot');
if (downloadIconEl) downloadIconEl.innerHTML = Icons.render('download');

const uploadIconEl = document.getElementById('upload-icon-slot');
if (uploadIconEl) uploadIconEl.innerHTML = Icons.render('upload');

const exportPatientsBtn = document.getElementById('export-patients-btn');
if (exportPatientsBtn) {
  exportPatientsBtn.addEventListener('click', () => ExportModal.open('patients'));
}

const importPatientsBtn = document.getElementById('import-patients-btn');
if (importPatientsBtn) {
  if (!perms.create) {
    importPatientsBtn.style.display = 'none';
  } else {
    importPatientsBtn.addEventListener('click', () => ImportModal.open('patients', () => loadPatients()));
  }
}

if (!perms.create) {
  document.getElementById('new-patient-btn').style.display = 'none';
}

let currentList = [];
let editingId = null;

let DEPARTMENT_POSITIONS = {};
let dynamicDepartments = [];

async function loadDepartmentOptions() {
  try {
    dynamicDepartments = await Api.departments.list();
    DEPARTMENT_POSITIONS = {};
    for (const d of dynamicDepartments) {
      DEPARTMENT_POSITIONS[d.name] = (d.positions || []).map(p => p.name);
    }

    // Populate department-filter
    const deptFilter = document.getElementById('department-filter');
    if (deptFilter) {
      const currentVal = deptFilter.value;
      deptFilter.innerHTML = `<option value="all">All departments</option>` +
        dynamicDepartments.map(d => `<option value="${UI.escapeHtml(d.name)}">${UI.escapeHtml(d.name)}</option>`).join('');
      if (currentVal && (currentVal === 'all' || dynamicDepartments.some(d => d.name === currentVal))) {
        deptFilter.value = currentVal;
      }
    }

    // Populate pf-department in modal
    const pfDept = document.getElementById('pf-department');
    if (pfDept) {
      const currentVal = pfDept.value;
      pfDept.innerHTML = `<option value="">Select department…</option>` +
        dynamicDepartments.map(d => `<option value="${UI.escapeHtml(d.name)}">${UI.escapeHtml(d.name)}</option>`).join('');
      if (currentVal) pfDept.value = currentVal;
    }
  } catch (err) {
    console.error('Failed to load department options', err);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadPatients() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  const department = document.getElementById('department-filter').value;
  try {
    currentList = await Api.patients.list({ search, status, department });
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
          <p>${perms.create ? 'Try a different search, or register a new patient.' : 'Try a different search.'}</p>
          ${perms.create ? `<button class="btn btn-primary" onclick="openPatientForm()">${Icons.render('plus')} New Patient</button>` : ''}
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Code</th><th>Full name</th><th>Department</th><th>Medical Certificate</th><th>Age</th><th>Phone</th><th>Registered</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          ${list.map(p => `
            <tr>
              <td><span class="cell-code">${p.patient_code}</span></td>
              <td class="cell-primary" style="cursor:pointer;" onclick="openPatientDetail('${p.id}')">
                <div style="display:flex; align-items:center; gap:10px;">
                  ${UI.avatar(p.full_name, p.photo_url, 'width:32px; height:32px; font-size:11px;')}
                  <span>${UI.escapeHtml(p.full_name)}</span>
                </div>
              </td>
              <td class="cell-muted">
                <div>${p.department ? UI.escapeHtml(p.department) : '—'}</div>
                <div style="font-size:11px; color:var(--color-text-muted);">${UI.escapeHtml(p.position || 'Staff')}</div>
              </td>
              <td>${UI.medicalCertificateBadge(p)}</td>
              <td class="cell-muted">${UI.age(p.date_of_birth)}</td>
              <td class="cell-muted">${UI.escapeHtml(p.phone) || '—'}</td>
              <td class="cell-muted">${UI.formatDate(p.registered_date)}</td>
              <td>${UI.patientStatusBadge(p.is_active)}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="View" onclick="openPatientDetail('${p.id}')">${Icons.render('eye')}</button>
                  ${perms.edit ? `<button class="icon-btn" title="Edit" onclick="openPatientForm('${p.id}')">${Icons.render('edit')}</button>` : ''}
                  ${(RoleGuard.has('hr_admin') || RoleGuard.has('system_administrator')) ? `<button class="icon-btn text-danger" style="color: #dc3545;" title="Delete" onclick="deletePatientList(event, '${p.id}')">${Icons.render('trash')}</button>` : ''}
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
  if (!perms.create && !perms.edit) return;
  editingId = id;
  const backdrop = document.getElementById('patient-modal-backdrop');
  const form = document.getElementById('patient-form');
  form.reset();
  document.getElementById('patient-form-note').textContent = '';

  let initialPhoto = '';
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
    document.getElementById('pf-dob').value = p.date_of_birth ? String(p.date_of_birth).slice(0, 10) : '';
    document.getElementById('pf-gender').value = p.gender || '';
    document.getElementById('pf-department').value = p.department || '';
    document.getElementById('pf-department').dispatchEvent(new Event('change'));
    document.getElementById('pf-position').value = p.position || '';
    document.getElementById('pf-phone').value = p.phone || '';
    document.getElementById('pf-location').value = p.location || '';
    document.getElementById('pf-address').value = p.address || '';
    initialPhoto = p.photo_url || '';
  } else {
    document.getElementById('patient-modal-title').textContent = 'New Patient';
    document.getElementById('patient-modal-sub').textContent = 'Add a walk-in patient to the clinic register.';
    document.getElementById('pf-department').value = '';
    document.getElementById('pf-department').dispatchEvent(new Event('change'));
    document.getElementById('patient-form-note').textContent = 'A patient code (S0xx) will be assigned automatically.';
  }

  const photoContainer = document.getElementById('pf-photo-container');
  if (photoContainer && typeof CameraWidget !== 'undefined') {
    photoContainer.innerHTML = CameraWidget.renderPickerHtml({
      hiddenInputId: 'pf-photo-url',
      previewImgId: 'pf-photo-preview',
      initialUrl: initialPhoto,
    });
    CameraWidget.bindEvents({
      hiddenInputId: 'pf-photo-url',
      previewImgId: 'pf-photo-preview',
    });
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
  const photoInput = document.getElementById('pf-photo-url');
  const payload = {
    full_name: document.getElementById('pf-full-name').value.trim(),
    date_of_birth: document.getElementById('pf-dob').value || null,
    gender: document.getElementById('pf-gender').value || null,
    department: document.getElementById('pf-department').value || null,
    position: document.getElementById('pf-position').value || null,
    phone: document.getElementById('pf-phone').value.trim(),
    location: document.getElementById('pf-location').value.trim(),
    address: document.getElementById('pf-address').value.trim(),
    photo_url: photoInput ? photoInput.value : null,
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
    document.getElementById('pd-name').innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        ${UI.avatar(p.full_name, p.photo_url, 'width:44px; height:44px; font-size:16px;')}
        <div>${UI.escapeHtml(p.full_name)}</div>
      </div>
    `;
    document.getElementById('pd-code').textContent = `${p.patient_code} · registered ${UI.formatDate(p.registered_date)}`;

    if (perms.visitHistory === 'department') {
      await renderRestrictedPatientDetail(p);
    } else if (perms.visitHistory === 'none') {
      renderIdentityOnlyPatientDetail(p);
    } else {
      renderFullPatientDetail(p);
    }

    const isAdmin = RoleGuard.has('hr_admin') || RoleGuard.has('system_administrator');
    const archiveBtn = document.getElementById('pd-archive-btn');
    const deleteBtn = document.getElementById('pd-delete-btn');
    
    archiveBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    archiveBtn.textContent = p.is_active ? 'Archive Patient' : 'Restore Patient';
    deleteBtn.style.display = isAdmin ? 'inline-flex' : 'none';

    archiveBtn.onclick = async () => {
      const isArchiving = p.is_active;
      if (isArchiving && !confirm('Archive this patient? They will be hidden from active lists but their history remains.')) return;
      if (!isArchiving && !confirm('Restore this patient?')) return;
      
      archiveBtn.disabled = true;
      try {
        await Api.patients.update(p.id, { is_active: !isArchiving });
        UI.toast(isArchiving ? 'Patient archived.' : 'Patient restored.');
        closePatientDetail();
        loadPatients();
      } catch (err) {
        UI.toast(UI.errorMessage(err), 'danger');
      } finally {
        archiveBtn.disabled = false;
      }
    };

    deleteBtn.onclick = async () => {
      if (!confirm('HARD DELETE this patient? ALL their medical history, visits, prescriptions, and lab orders will be permanently erased. This cannot be undone!')) return;
      deleteBtn.disabled = true;
      try {
        await Api.patients.delete(p.id);
        UI.toast('Patient permanently deleted.');
        closePatientDetail();
        loadPatients();
      } catch (err) {
        UI.toast(UI.errorMessage(err), 'danger');
      } finally {
        deleteBtn.disabled = false;
      }
    };

    const certBtn = document.getElementById('pd-cert-btn');
    if (certBtn) {
      const hasCert = !!(p.latest_certificate_id || (p.certifications && p.certifications.length > 0));
      certBtn.textContent = hasCert ? 'Renew Certificate' : 'Record Certificate';
      certBtn.onclick = () => {
        closePatientDetail();
        window.location.href = `certifications.html?patientId=${p.id}`;
      };
    }

    document.getElementById('patient-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

async function deletePatientList(e, id) {
  e.stopPropagation();
  if (!confirm('HARD DELETE this patient? ALL their medical history, visits, prescriptions, and lab orders will be permanently erased. This cannot be undone!')) return;
  try {
    await Api.patients.delete(id);
    UI.toast('Patient permanently deleted.');
    loadPatients();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

function renderFullPatientDetail(p) {
  const certs = p.certifications || [];
  const latestCert = certs[0] || null;

  document.getElementById('patient-detail-body').innerHTML = `
    <div class="detail-section">
      <h4>Patient information</h4>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Gender</div><div class="v" style="text-transform:capitalize;">${p.gender || '—'}</div></div>
        <div class="detail-item"><div class="k">Age</div><div class="v">${UI.age(p.date_of_birth)}</div></div>
        <div class="detail-item"><div class="k">Department</div><div class="v">${UI.escapeHtml(p.department) || '—'}</div></div>
        <div class="detail-item"><div class="k">Position</div><div class="v">${UI.escapeHtml(p.position) || '—'}</div></div>
        <div class="detail-item"><div class="k">Phone</div><div class="v">${UI.escapeHtml(p.phone) || '—'}</div></div>
        <div class="detail-item"><div class="k">Status</div><div class="v">${UI.patientStatusBadge(p.is_active)}</div></div>
        <div class="detail-item"><div class="k">Location</div><div class="v">${UI.escapeHtml(p.location) || '—'}</div></div>
        <div class="detail-item"><div class="k">Address</div><div class="v">${UI.escapeHtml(p.address) || '—'}</div></div>
      </div>
    </div>

    <div class="detail-section">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <h4 style="margin:0;">Medical Fitness Certification &amp; 6-Month Checkup</h4>
        ${UI.medicalCertificateBadge(p)}
      </div>

      <div class="detail-grid" style="margin-bottom:10px;">
        <div class="detail-item"><div class="k">Last Examination Date</div><div class="v" style="font-weight:600;">${p.last_fitness_exam_date ? UI.formatDate(p.last_fitness_exam_date) : (latestCert ? UI.formatDate(latestCert.examination_date) : 'Not recorded')}</div></div>
        <div class="detail-item"><div class="k">6-Month Card Expiry Date</div><div class="v" style="font-weight:600;">${p.next_checkup_due_date ? UI.formatDate(p.next_checkup_due_date) : 'Not scheduled'}</div></div>
        <div class="detail-item"><div class="k">Examining Physician</div><div class="v">${latestCert ? UI.escapeHtml(latestCert.physician_name || '—') : '—'}</div></div>
        <div class="detail-item"><div class="k">Certification Type</div><div class="v">${latestCert ? (latestCert.certification_type === 'periodic_renewal' ? '6-Month Periodic Renewal' : 'Pre-Employment Initial') : '—'}</div></div>
      </div>

      ${!certs.length ? `
        <div class="notice notice-warning" style="margin-top:8px;">
          ${Icons.render('alert')}
          <div>
            <strong>Medical Certificate Not Found:</strong> This employee has no physical fitness examination certificate on record.
            <div style="margin-top:6px;">
              <a href="certifications.html?patientId=${p.id}" class="btn btn-secondary btn-sm" style="display:inline-flex; align-items:center; gap:6px;">
                ${Icons.render('plus')} Record Initial Certificate Now
              </a>
            </div>
          </div>
        </div>
      ` : `
        <div style="font-size:12px; color:var(--color-text-muted); margin-top:6px;">
          ${certs.length} certificate exam record(s) archived in medical file.
        </div>
      `}
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
  document.getElementById('pd-edit-btn').style.display = perms.edit ? 'inline-flex' : 'none';
  document.getElementById('pd-new-visit-btn').style.display = perms.canStartVisit ? 'inline-flex' : 'none';
  document.getElementById('pd-edit-btn').onclick = () => { closePatientDetail(); openPatientForm(p.id); };
  document.getElementById('pd-new-visit-btn').onclick = () => { window.location.href = `visits.html?newFor=${p.id}`; };
}

function renderIdentityOnlyPatientDetail(p) {
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
    </div>
    <p class="text-muted" style="font-size:12.5px;">${p.visits.length} visit(s) on file. Clinical details are managed by the attending physician.</p>
  `;
  document.getElementById('pd-edit-btn').style.display = perms.edit ? 'inline-flex' : 'none';
  document.getElementById('pd-new-visit-btn').style.display = perms.canStartVisit ? 'inline-flex' : 'none';
  document.getElementById('pd-edit-btn').onclick = () => { closePatientDetail(); openPatientForm(p.id); };
  document.getElementById('pd-new-visit-btn').onclick = () => { window.location.href = `visits.html?newFor=${p.id}`; };
}

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

document.getElementById('pf-department').addEventListener('change', (e) => {
  const dept = e.target.value;
  const posSelect = document.getElementById('pf-position');
  if (!dept) {
    posSelect.innerHTML = '<option value="">Select department first…</option>';
    return;
  }
  const positions = DEPARTMENT_POSITIONS[dept] || [];
  posSelect.innerHTML = `<option value="">Select position…</option>` +
    positions.map(p => `<option value="${UI.escapeHtml(p)}">${UI.escapeHtml(p)}</option>`).join('');
});

document.getElementById('search-input').addEventListener('input', debounce(loadPatients, 250));
document.getElementById('status-filter').addEventListener('change', loadPatients);
document.getElementById('department-filter').addEventListener('change', loadPatients);

async function init() {
  await loadDepartmentOptions();
  await loadPatients();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openPatientDetail(params.get('open'));
}
init();
