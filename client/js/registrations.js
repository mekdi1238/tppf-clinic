/* ===========================================================
   Employee Registrations page logic
   =========================================================== */

Auth.requireAuth();
if (RoleGuard.blockIfNotAllowed('employee-registrations')) { throw new Error('redirecting'); }

const isReceptionist = RoleGuard.restrictedRole() === 'receptionist';
renderShell('employee-registrations');
setPageTitle('Employee Registrations');

document.getElementById('header-info-icon').innerHTML = Icons.render('info');
document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('plus-icon-slot').innerHTML = Icons.render('plus');
document.getElementById('reg-modal-close').innerHTML = Icons.render('close');
document.getElementById('reg-detail-close').innerHTML = Icons.render('close');
document.getElementById('cert-modal-close').innerHTML = Icons.render('close');
document.getElementById('staff-modal-close').innerHTML = Icons.render('close');

let currentList = [];
let physiciansCache = [];
let editingRegId = null;

// Role check: only hr_admin and physician can accept candidates as staff
const canAcceptAsStaff = RoleGuard.has('hr_admin') || RoleGuard.has('physician') || RoleGuard.has('system_administrator');

// ---------- Department → Position map ----------
// Positions are placeholders; update with your final list when ready.
const DEPARTMENT_POSITIONS = {
  'Medical': [
    'Physician (General)',
    'Specialist Physician',
    'Lab Technician',
    'Pharmacist',
    'Nurse',
    'Radiologist',
    'Medical Officer',
  ],
  'Finance': [
    'Finance Officer',
    'Accountant',
    'Senior Accountant',
    'Finance Manager',
    'Budget Officer',
  ],
  'Human Resource Management': [
    'HR Manager',
    'HR Officer',
    'HR Administrator',
    // Safety and Security sub-unit
    'Safety Officer',
    'Security Officer',
    'Security Guard',
    'Safety and Security Supervisor',
  ],
  'Planning and Budget Service': [
    'Planning Officer',
    'Budget Analyst',
    'Planning Manager',
    'Budget Planning Coordinator',
  ],
  'Product Quality Control Service': [
    'Quality Control Inspector',
    'QC Supervisor',
    'Quality Assurance Officer',
    'QC Manager',
  ],
  'Production and Technic': [
    'Technician',
    'Machine Operator',
    'Production Supervisor',
    'Senior Technician',
    'Maintenance Engineer',
  ],
  'Property Management': [
    'Property Officer',
    'Facility Manager',
    'Property Supervisor',
    'Maintenance Officer',
  ],
};

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

async function loadPhysicians() {
  physiciansCache = await Api.physicians.list();
  document.getElementById('cf-physician').innerHTML = `<option value="">Select…</option>` +
    physiciansCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.full_name)}</option>`).join('');
}

async function loadRegistrations() {
  const search = document.getElementById('search-input').value.trim();
  const status = document.getElementById('status-filter').value;
  try {
    currentList = await Api.registrations.list({ search, status });
    renderTable(currentList);
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderTable(list) {
  const region = document.getElementById('registrations-table-region');
  if (!list.length) {
    region.innerHTML = `
      <div class="table-wrap">
        <div class="empty-state">
          <div class="empty-icon">${Icons.render('employees')}</div>
          <h3>No registrations found</h3>
          <p>Try a different search or filter, or register a new candidate.</p>
          <button class="btn btn-primary" onclick="openRegForm()">${Icons.render('plus')} New Registration</button>
        </div>
      </div>`;
    return;
  }
  region.innerHTML = `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr><th>Code</th><th>Full name</th><th>Gender</th><th>Age</th><th>Occupation</th><th>Registered</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          ${list.map(r => `
            <tr>
              <td><span class="cell-code">${r.registration_code}</span></td>
              <td class="cell-primary" style="cursor:pointer;" onclick="openRegDetail('${r.id}')">
                <div style="display:flex; align-items:center; gap:10px;">
                  ${UI.avatar(r.full_name, r.photo_url, 'width:32px; height:32px; font-size:11px;')}
                  <span>${UI.escapeHtml(r.full_name)}</span>
                </div>
              </td>
              <td class="cell-muted" style="text-transform:capitalize;">${r.gender || '—'}</td>
              <td class="cell-muted">${UI.age(r.date_of_birth)}</td>
              <td class="cell-muted">${UI.escapeHtml(r.occupation)}</td>
              <td class="cell-muted">${UI.formatDate(r.registration_date)}</td>
              <td>${UI.registrationStatusBadge(r.status)}</td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="View" onclick="openRegDetail('${r.id}')">${Icons.render('eye')}</button>
                  ${(RoleGuard.has('hr_admin') || RoleGuard.has('system_administrator')) ? `<button class="icon-btn text-danger" style="color: #dc3545;" title="Delete" onclick="deleteRegistrationList(event, '${r.id}')">${Icons.render('trash')}</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ---------- New / edit registration ----------
async function openRegForm(id = null) {
  editingRegId = id;
  const form = document.getElementById('reg-form');
  form.reset();

  let initialPhoto = '';
  if (id) {
    let r;
    try {
      r = await Api.registrations.get(id);
    } catch (e) {
      UI.toast(UI.errorMessage(e), 'danger');
      return;
    }
    document.querySelector('#reg-modal-backdrop h2').textContent = 'Edit Registration';
    document.querySelector('#reg-modal-backdrop .modal-header p').textContent = `Update details for ${r.registration_code}.`;
    document.getElementById('reg-form-note').textContent = '';
    document.getElementById('rf-full-name').value = r.full_name || '';
    document.getElementById('rf-dob').value = r.date_of_birth || '';
    document.getElementById('rf-gender').value = r.gender || '';
    document.getElementById('rf-location').value = r.location || '';
    document.getElementById('rf-occupation').value = r.occupation || '';
    document.getElementById('rf-department').value = r.department || '';
    document.getElementById('rf-department').dispatchEvent(new Event('change'));
    document.getElementById('rf-position').value = r.position || '';
    initialPhoto = r.photo_url || '';
  } else {
    document.querySelector('#reg-modal-backdrop h2').textContent = 'New Registration';
    document.querySelector('#reg-modal-backdrop .modal-header p').textContent = 'Register a pre-employment candidate.';
    document.getElementById('reg-form-note').textContent = 'A registration code (R0xx) will be assigned automatically.';
  }

  const photoContainer = document.getElementById('rf-photo-container');
  if (photoContainer && typeof CameraWidget !== 'undefined') {
    photoContainer.innerHTML = CameraWidget.renderPickerHtml({
      hiddenInputId: 'rf-photo-url',
      previewImgId: 'rf-photo-preview',
      initialUrl: initialPhoto,
    });
    CameraWidget.bindEvents({
      hiddenInputId: 'rf-photo-url',
      previewImgId: 'rf-photo-preview',
    });
  }

  document.getElementById('reg-modal-backdrop').classList.add('visible');
}
function closeRegForm() {
  document.getElementById('reg-modal-backdrop').classList.remove('visible');
  editingRegId = null;
}
document.getElementById('new-registration-btn').addEventListener('click', () => openRegForm());
document.getElementById('reg-modal-close').addEventListener('click', closeRegForm);
document.getElementById('reg-form-cancel').addEventListener('click', closeRegForm);
document.getElementById('reg-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'reg-modal-backdrop') closeRegForm();
});

document.getElementById('reg-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const photoInput = document.getElementById('rf-photo-url');
  const payload = {
    full_name: document.getElementById('rf-full-name').value.trim(),
    date_of_birth: document.getElementById('rf-dob').value || null,
    gender: document.getElementById('rf-gender').value || null,
    location: document.getElementById('rf-location').value.trim(),
    department: document.getElementById('rf-department').value.trim(),
    position: document.getElementById('rf-position').value.trim(),
    occupation: document.getElementById('rf-occupation').value.trim(),
    photo_url: photoInput ? photoInput.value : null,
  };
  const btn = document.getElementById('reg-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    if (editingRegId) {
      await Api.registrations.update(editingRegId, payload);
      UI.toast('Registration updated.');
    } else {
      const created = await Api.registrations.create(payload);
      UI.toast(`Registration ${created.registration_code} saved.`);
    }
    closeRegForm();
    loadRegistrations();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Registration';
  }
});

// ---------- Registration detail ----------
async function openRegDetail(id) {
  try {
    const r = await Api.registrations.get(id);
    renderRegDetail(r);
    document.getElementById('reg-detail-backdrop').classList.add('visible');
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
  }
}

function renderRegDetail(r) {
  document.getElementById('rd-name').innerHTML = `
    <div style="display:flex; align-items:center; gap:12px;">
      ${UI.avatar(r.full_name, r.photo_url, 'width:44px; height:44px; font-size:16px;')}
      <div>${UI.escapeHtml(r.full_name)}</div>
    </div>
  `;
  document.getElementById('rd-code').textContent = `${r.registration_code} · registered ${UI.formatDate(r.registration_date)}`;

  document.getElementById('reg-detail-body').innerHTML = `
    <div class="detail-section">
      <div style="margin-bottom:10px;">${UI.registrationStatusBadge(r.status)}</div>
      <div class="detail-grid">
        <div class="detail-item"><div class="k">Gender</div><div class="v" style="text-transform:capitalize;">${r.gender || '—'}</div></div>
        <div class="detail-item"><div class="k">Age</div><div class="v">${UI.age(r.date_of_birth)}</div></div>
        <div class="detail-item"><div class="k">Location</div><div class="v">${UI.escapeHtml(r.location) || '—'}</div></div>
        <div class="detail-item"><div class="k">Occupation applied for</div><div class="v">${UI.escapeHtml(r.occupation)}</div></div>
      </div>

      ${r.hired_staff ? `
        <div class="notice notice-info" style="margin-top:14px;">
          ${Icons.render('employees')}
          <span>Accepted as clinic staff — <strong>${r.hired_staff.staff_code}</strong> &middot; ${UI.escapeHtml(r.hired_staff.position)}, ${UI.escapeHtml(r.hired_staff.department)}.</span>
        </div>` : ''}
    </div>
    <div class="detail-section">
      <h4>Certification history (${r.certifications.length})</h4>
      ${r.certifications.length ? `
        <div class="timeline">
          ${r.certifications.map(c => `
            <div class="timeline-item">
              <div class="timeline-dot"></div>
              <div class="timeline-body">
                <div class="t">${UI.certResultBadge(c.result)} <span style="margin-left:6px;">by ${UI.escapeHtml(c.physician ? c.physician.full_name : '—')}</span></div>
                <div class="d">${UI.formatDateTime(c.examination_date)}${c.other_findings ? ' · ' + UI.escapeHtml(c.other_findings) : ''}</div>
              </div>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-muted" style="font-size:12.5px;">No certification exam recorded yet.</p>`}
    </div>
  `;

  const footer = document.getElementById('reg-detail-footer');
  const canCertify = CERTIFIABLE_STATUSES_CLIENT.includes(r.status) && !isReceptionist;
  const isArchived = r.status === 'withdrawn';
  const canWithdraw = (r.status !== 'hired' && r.status !== 'accepted_as_staff') || isArchived;
  const canEdit = r.status !== 'hired' && r.status !== 'accepted_as_staff';
  const canConvertToStaff = r.status === 'certified_fit' && canAcceptAsStaff && !r.hired_staff;
  const isAdmin = RoleGuard.has('hr_admin') || RoleGuard.has('system_administrator');

  footer.innerHTML = `
    <span class="footer-note"></span>
    ${canEdit ? `<button class="btn btn-secondary" id="rd-edit-btn">Edit</button>` : ''}
    ${canWithdraw ? `<button class="btn btn-secondary" id="rd-withdraw-btn">${isArchived ? 'Restore' : 'Archive'}</button>` : ''}
    ${isAdmin ? `<button class="btn btn-danger" id="rd-delete-btn" style="background-color: #dc3545; color: white;">Delete (Hard)</button>` : ''}
    ${canCertify ? `<button class="btn btn-secondary" id="rd-certify-btn">Record Certification</button>` : ''}
    ${canConvertToStaff ? `<button class="btn btn-secondary" id="rd-staff-btn">${Icons.render('employees')} Accept as Staff</button>` : ''}
    ${!canCertify && !canWithdraw && !canEdit && !canConvertToStaff && !isAdmin ? `<span class="footer-note">This record is closed to further changes.</span>` : ''}
  `;

  if (canEdit) document.getElementById('rd-edit-btn').addEventListener('click', () => { closeRegDetail(); openRegForm(r.id); });
  if (canWithdraw) document.getElementById('rd-withdraw-btn').addEventListener('click', (e) => withdrawRegistration(r.id, e.currentTarget));
  if (isAdmin) document.getElementById('rd-delete-btn').addEventListener('click', (e) => deleteRegistration(r.id, e.currentTarget));
  if (canCertify) document.getElementById('rd-certify-btn').addEventListener('click', () => openCertForm(r));
  if (canConvertToStaff) document.getElementById('rd-staff-btn').addEventListener('click', () => openAcceptAsStaffForm(r));
}

const CERTIFIABLE_STATUSES_CLIENT = ['pending', 'certified_fit', 'certified_unfit'];

async function withdrawRegistration(id, btn) {
  const isRestoring = btn.textContent.trim() === 'Restore';
  if (!isRestoring && !confirm('Archive this candidate\'s registration? They will be hidden but can be restored later.')) return;
  if (isRestoring && !confirm('Restore this registration?')) return;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Processing…';
  try {
    await Api.registrations.update(id, { status: isRestoring ? 'pending' : 'withdrawn' });
    UI.toast(isRestoring ? 'Registration restored.' : 'Registration archived.');
    closeRegDetail();
    loadRegistrations();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

async function deleteRegistrationList(e, id) {
  e.stopPropagation();
  if (!confirm('HARD DELETE this registration? ALL medical exams and staff accounts linked to this candidate will be permanently erased. This cannot be undone!')) return;
  try {
    await Api.registrations.delete(id);
    UI.toast('Registration permanently deleted.');
    loadRegistrations();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  }
}

async function deleteRegistration(id, btn) {
  if (!confirm('HARD DELETE this registration? ALL medical exams and staff accounts linked to this candidate will be permanently erased. This cannot be undone!')) return;
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Deleting…';
  try {
    await Api.registrations.delete(id);
    UI.toast('Registration permanently deleted.');
    closeRegDetail();
    loadRegistrations();
  } catch (e) {
    UI.toast(UI.errorMessage(e), 'danger');
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}



// ---------- Accept as Staff modal ----------
function openAcceptAsStaffForm(registration) {
  document.getElementById('staff-form').reset();
  document.getElementById('sf-registration-id').value = registration.id;
  document.getElementById('staff-modal-sub').textContent =
    `Assign a clinic staff role for ${registration.full_name} (${registration.registration_code}).`;

  // Default date recruited to today
  document.getElementById('sf-date-recruited').value = new Date().toISOString().slice(0, 10);
  
  const isMedical = registration.department === 'Medical';
  document.getElementById('sf-license-field').style.display = isMedical ? 'block' : 'none';
  document.getElementById('sf-qualification-field').style.display = isMedical ? 'block' : 'none';

  closeRegDetail();
  document.getElementById('staff-modal-backdrop').classList.add('visible');
}

function closeStaffForm() {
  document.getElementById('staff-modal-backdrop').classList.remove('visible');
}

document.getElementById('staff-modal-close').addEventListener('click', closeStaffForm);
document.getElementById('staff-form-cancel').addEventListener('click', closeStaffForm);
document.getElementById('staff-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'staff-modal-backdrop') closeStaffForm();
});

// Cascade: when department changes, repopulate the position dropdown
// and toggle medical-only fields
document.getElementById('rf-department').addEventListener('change', (e) => {
  const dept = e.target.value;
  const posSelect = document.getElementById('rf-position');
  if (!dept) {
    posSelect.innerHTML = '<option value="">Select department first…</option>';
    return;
  }
  const positions = DEPARTMENT_POSITIONS[dept] || [];
  posSelect.innerHTML = positions.map(p => `<option value="${p}">${p}</option>`).join('');

  // Show medical fields only if it's the Medical department
  const isMedical = dept === 'Medical';
  document.getElementById('sf-license-field').style.display = isMedical ? 'block' : 'none';
  document.getElementById('sf-qualification-field').style.display = isMedical ? 'block' : 'none';
});

document.getElementById('staff-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const registrationId = document.getElementById('sf-registration-id').value;
  const btn = document.getElementById('staff-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';

  const payload = {
    date_recruited: document.getElementById('sf-date-recruited').value || null,
    license_no: document.getElementById('sf-license-no').value.trim() || null,
    qualification: document.getElementById('sf-qualification').value.trim() || null,
  };

  try {
    const result = await Api.registrations.acceptAsStaff(registrationId, payload);
    UI.toast(`${result.staff.full_name} is now clinic staff — ${result.staff.staff_code} (${result.staff.position}, ${result.staff.department}).`);
    closeStaffForm();
    loadRegistrations();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Accept as Staff';
  }
});

function closeRegDetail() {
  document.getElementById('reg-detail-backdrop').classList.remove('visible');
}
document.getElementById('reg-detail-close').addEventListener('click', closeRegDetail);
document.getElementById('reg-detail-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'reg-detail-backdrop') closeRegDetail();
});

// ---------- Certification modal ----------
function openCertForm(registration) {
  document.getElementById('cert-form').reset();
  document.getElementById('cf-registration-id').value = registration.id;
  document.getElementById('cert-modal-sub').textContent = `Pre-employment medical exam for ${registration.full_name} (${registration.registration_code}).`;
  document.getElementById('cert-modal-backdrop').classList.add('visible');
}
function closeCertForm() {
  document.getElementById('cert-modal-backdrop').classList.remove('visible');
}
document.getElementById('cert-modal-close').addEventListener('click', closeCertForm);
document.getElementById('cert-form-cancel').addEventListener('click', closeCertForm);
document.getElementById('cert-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'cert-modal-backdrop') closeCertForm();
});

document.getElementById('cert-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    employee_registration_id: document.getElementById('cf-registration-id').value,
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
  if (!payload.physician_id || !payload.result) {
    UI.toast('Select the examining physician and record a result.', 'danger');
    return;
  }
  const btn = document.getElementById('cert-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await Api.certifications.create(payload);
    UI.toast(`Exam result recorded: ${payload.result === 'fit' ? 'Fit' : 'Unfit'}.`);
    closeCertForm();
    closeRegDetail();
    loadRegistrations();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Exam Result';
  }
});

document.getElementById('search-input').addEventListener('input', debounce(loadRegistrations, 250));
document.getElementById('status-filter').addEventListener('change', loadRegistrations);

async function init() {
  await loadPhysicians();
  await loadRegistrations();
  const params = new URLSearchParams(window.location.search);
  if (params.get('open')) openRegDetail(params.get('open'));
}
init();
