/* ===========================================================
   Department HR Portal Controller (dept-hr.js)
   =========================================================== */

if (!Auth.requireAuth()) {
  // auth handles redirect
}

RoleGuard.blockIfNotAllowed('dept-hr');
renderShell('dept-hr');
setPageTitle('Department HR Portal');

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let currentUser = null;
let patientsCache = [];
let sickLeavesCache = [];
let selectedPatientForDispatch = null;

// Icons setup
document.getElementById('search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('sick-search-icon-slot').innerHTML = Icons.render('search');
document.getElementById('dispatch-tab-icon').innerHTML = Icons.render('plus');
document.getElementById('sick-tab-icon').innerHTML = Icons.render('referrals');
document.getElementById('notice-icon-slot').innerHTML = Icons.render('info');
document.getElementById('dispatch-modal-close').innerHTML = Icons.render('close');
document.getElementById('sick-cert-modal-close').innerHTML = Icons.render('close');

// Tab toggling
const tabBtnDispatch = document.getElementById('tab-btn-dispatch');
const tabBtnSickLeaves = document.getElementById('tab-btn-sick-leaves');
const sectionDispatch = document.getElementById('section-dispatch');
const sectionSickLeaves = document.getElementById('section-sick-leaves');

tabBtnDispatch.addEventListener('click', () => {
  tabBtnDispatch.style.fontWeight = '700';
  tabBtnDispatch.style.color = 'var(--color-text)';
  tabBtnDispatch.style.borderBottom = '2px solid var(--color-primary)';
  
  tabBtnSickLeaves.style.fontWeight = '600';
  tabBtnSickLeaves.style.color = 'var(--color-text-muted)';
  tabBtnSickLeaves.style.borderBottom = 'none';

  sectionDispatch.style.display = 'block';
  sectionSickLeaves.style.display = 'none';
  loadStaff();
});

tabBtnSickLeaves.addEventListener('click', () => {
  tabBtnSickLeaves.style.fontWeight = '700';
  tabBtnSickLeaves.style.color = 'var(--color-text)';
  tabBtnSickLeaves.style.borderBottom = '2px solid var(--color-primary)';
  
  tabBtnDispatch.style.fontWeight = '600';
  tabBtnDispatch.style.color = 'var(--color-text-muted)';
  tabBtnDispatch.style.borderBottom = 'none';

  sectionDispatch.style.display = 'none';
  sectionSickLeaves.style.display = 'block';
  loadSickLeaves();
});

// Load Current User Info & Department
async function loadUserInfo() {
  try {
    currentUser = await Api.profile.get();
    const deptBadge = document.getElementById('dept-badge-container');
    if (currentUser.department) {
      deptBadge.innerHTML = `<span class="badge badge-primary" style="font-size:13px; padding:6px 12px;">Assigned Department: <strong>${UI.escapeHtml(currentUser.department)}</strong></span>`;
      document.getElementById('dept-filter-select').value = currentUser.department;
    } else {
      deptBadge.innerHTML = `<span class="badge badge-neutral" style="font-size:13px; padding:6px 12px;">Assigned Department: <strong>All Departments</strong></span>`;
    }
  } catch (err) {
    console.error('Failed to fetch user profile:', err);
  }
}

// Load Staff List for Checkup Dispatch
async function loadStaff() {
  const region = document.getElementById('staff-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading staff records…</p></div>';

  const search = document.getElementById('staff-search-input').value.trim();
  const department = document.getElementById('dept-filter-select').value;

  try {
    const params = {};
    if (search) params.search = search;
    if (department && department !== 'all') params.department = department;

    patientsCache = await Api.patients.list(params);

    if (!patientsCache.length) {
      region.innerHTML = `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">${Icons.render('users')}</div>
            <h3>No department staff found</h3>
            <p>Try refining your search or select a different department filter.</p>
          </div>
        </div>`;
      return;
    }

    region.innerHTML = `
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Full Name</th>
              <th>Gender</th>
              <th>Department</th>
              <th>Position</th>
              <th>Phone</th>
              <th style="text-align:right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${patientsCache.map(p => `
              <tr>
                <td class="cell-primary" style="font-weight:700;">${UI.escapeHtml(p.patient_code)}</td>
                <td>
                  <div style="display:flex; align-items:center; gap:8px;">
                    ${UI.avatar(p.full_name, p.photo_url, 'width:28px; height:28px; font-size:10px;')}
                    <span style="font-weight:600;">${UI.escapeHtml(p.full_name)}</span>
                  </div>
                </td>
                <td class="cell-muted" style="text-transform:capitalize;">${UI.escapeHtml(p.gender || '—')}</td>
                <td><span class="badge badge-info">${UI.escapeHtml(p.department || 'General')}</span></td>
                <td class="cell-muted">${UI.escapeHtml(p.position || 'Staff')}</td>
                <td class="cell-muted">${UI.escapeHtml(p.phone || '—')}</td>
                <td style="text-align:right;">
                  <button class="btn btn-primary btn-sm" onclick="openDispatchModal('${p.id}')">
                    ${Icons.render('plus')} Send for Checkup
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    region.innerHTML = `<div class="notice notice-danger">${UI.escapeHtml(UI.errorMessage(err))}</div>`;
  }
}

// Dispatch Checkup Modal
function openDispatchModal(patientId) {
  const patient = patientsCache.find(p => String(p.id) === String(patientId));
  if (!patient) return;
  selectedPatientForDispatch = patient;

  document.getElementById('df-patient-id').value = patient.id;
  document.getElementById('df-staff-name').value = `${patient.full_name} (${patient.patient_code})`;
  document.getElementById('df-staff-dept').value = patient.department || 'General';
  document.getElementById('df-staff-pos').value = patient.position || 'Staff';
  document.getElementById('df-reason').value = '';

  document.getElementById('dispatch-modal-backdrop').classList.add('visible');
}

function closeDispatchModal() {
  document.getElementById('dispatch-modal-backdrop').classList.remove('visible');
  selectedPatientForDispatch = null;
}

document.getElementById('dispatch-modal-close').addEventListener('click', closeDispatchModal);
document.getElementById('dispatch-form-cancel').addEventListener('click', closeDispatchModal);
document.getElementById('dispatch-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'dispatch-modal-backdrop') closeDispatchModal();
});

document.getElementById('dispatch-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedPatientForDispatch) return;

  const btn = document.getElementById('dispatch-form-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating Visit…';

  try {
    const payload = {
      patient_id: selectedPatientForDispatch.id,
      chief_complaint: document.getElementById('df-reason').value.trim() || 'Department Checkup Dispatch',
    };

    await Api.visits.create(payload);
    UI.toast(`Checkup visit created for ${selectedPatientForDispatch.full_name}. Staff can now report to clinic for physician examination.`);
    closeDispatchModal();
  } catch (err) {
    UI.toast(UI.errorMessage(err), 'danger');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Checkup Visit';
  }
});

// Load Department Sick Leaves
async function loadSickLeaves() {
  const region = document.getElementById('sick-leaves-table-region');
  region.innerHTML = '<div class="empty-state"><span class="spinner"></span><p>Loading sick leaves…</p></div>';

  const search = document.getElementById('sick-search-input').value.trim();

  try {
    const params = {};
    if (search) params.search = search;
    if (currentUser && currentUser.department) params.department = currentUser.department;

    sickLeavesCache = await Api.sickLeaves.list(params);

    if (!sickLeavesCache.length) {
      region.innerHTML = `
        <div class="table-wrap">
          <div class="empty-state">
            <div class="empty-icon">${Icons.render('referrals')}</div>
            <h3>No sick leave certificates found</h3>
            <p>Sick leave certificates issued by physicians for your department staff will appear here.</p>
          </div>
        </div>`;
      return;
    }

    const autoVisitLeaves = sickLeavesCache.filter(s => s.auto_visit_id);
    let notificationBannerHtml = `
      <div class="notice notice-info" style="margin-bottom:16px; display:flex; align-items:center; gap:10px;">
        <span style="display:inline-flex; width:20px; height:20px;">${Icons.render('info')}</span>
        <div>
          <strong>Automatic Sick Leave Follow-up System Active:</strong>
          ${autoVisitLeaves.length ? ` ${autoVisitLeaves.length} employee sick leave(s) completed and automatically scheduled for clinic follow-up checkup examination.` : ' When an employee\'s sick leave period ends, a follow-up checkup visit is automatically created for clinic examination.'}
        </div>
      </div>`;

    region.innerHTML = `
      ${notificationBannerHtml}
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Employee Code</th>
              <th>Full Name</th>
              <th>Department</th>
              <th>Position</th>
              <th>Leave Start</th>
              <th>Leave End</th>
              <th>Duration</th>
              <th>Follow-up Status</th>
              <th>Attending Physician</th>
              <th style="text-align:right;">Certificate</th>
            </tr>
          </thead>
          <tbody>
            ${sickLeavesCache.map(s => {
              const startDate = UI.formatDate(s.leave_start);
              const endDate = UI.formatDate(s.leave_end);
              const daysCount = (function(item) {
                if (item.days !== undefined && item.days !== null && !isNaN(Number(item.days))) return Number(item.days);
                if (!item.leave_start || !item.leave_end) return 1;
                const st = new Date(item.leave_start);
                const en = new Date(item.leave_end);
                return Math.max(1, Math.ceil(Math.abs(en - st) / (1000 * 60 * 60 * 24)) + 1);
              })(s);
              const isAutoCreated = Boolean(s.auto_visit_id);
              return `
                <tr>
                  <td class="cell-primary" style="font-weight:700;">${UI.escapeHtml(s.patient_code || '—')}</td>
                  <td style="font-weight:600;">${UI.escapeHtml(s.patient_name || '—')}</td>
                  <td><span class="badge badge-info">${UI.escapeHtml(s.department || 'General')}</span></td>
                  <td class="cell-muted">${UI.escapeHtml(s.position || 'Staff')}</td>
                  <td>${startDate}</td>
                  <td>${endDate}</td>
                  <td><span class="badge badge-warning" style="font-weight:700;">${daysCount} Day${daysCount > 1 ? 's' : ''}</span></td>
                  <td>
                    ${isAutoCreated ? `<span class="badge badge-success" title="Follow-up checkup visit auto-created for clinic examination"><span class="badge-dot"></span>Checkup Auto-Scheduled</span>` : `<span class="badge badge-neutral">Active Leave</span>`}
                  </td>
                  <td class="cell-muted">${UI.escapeHtml(s.physician_name || 'Clinic Physician')}</td>
                  <td style="text-align:right;">
                    <button class="btn btn-secondary btn-sm" onclick="openSickCertModal('${s.id}')">
                      ${Icons.render('filecheck')} View Certificate
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    region.innerHTML = `<div class="notice notice-danger">${UI.escapeHtml(UI.errorMessage(err))}</div>`;
  }
}

// View Sick Leave Certificate Modal
function openSickCertModal(id) {
  const item = sickLeavesCache.find(s => String(s.id) === String(id));
  if (!item) return;

  const modalBody = document.getElementById('sick-cert-modal-body');
  modalBody.innerHTML = `
    <div style="border:2px solid var(--color-primary-light, #E0F2F1); border-radius:12px; padding:24px; background:#fff; font-family:var(--font-sans);">
      
      <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid var(--color-primary, #00897B); padding-bottom:16px; margin-bottom:20px;">
        <div>
          <div style="font-size:20px; font-weight:800; color:var(--color-primary-dark, #004D40); letter-spacing:0.5px;">TPPF CLINIC MEDICAL SERVICES</div>
          <div style="font-size:12px; color:var(--color-text-muted, #555); margin-top:2px;">OFFICIAL EMPLOYEE SICK LEAVE CERTIFICATE</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; text-transform:uppercase; color:#888;">Certificate Ref</div>
          <div style="font-size:14px; font-weight:700; color:var(--color-primary);">SLC-${String(item.id).padStart(5, '0')}</div>
        </div>
      </div>

      <div class="detail-grid" style="grid-template-columns: 1fr 1fr; gap:16px; margin-bottom:20px;">
        <div class="detail-item"><div class="k">Employee Name</div><div class="v" style="font-size:16px;">${UI.escapeHtml(item.patient_name)}</div></div>
        <div class="detail-item"><div class="k">Employee Code</div><div class="v" style="font-size:16px;">${UI.escapeHtml(item.patient_code)}</div></div>
        <div class="detail-item"><div class="k">Department</div><div class="v">${UI.escapeHtml(item.department || 'General')}</div></div>
        <div class="detail-item"><div class="k">Position</div><div class="v">${UI.escapeHtml(item.position || 'Staff')}</div></div>
      </div>

      <div style="background:var(--color-bg-secondary, #F4F6F6); border-radius:8px; padding:16px; margin-bottom:20px;">
        <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-text-muted); margin-bottom:8px;">Authorized Leave Period</div>
        <div style="display:flex; align-items:center; gap:20px; flex-wrap:wrap;">
          <div><span style="font-size:12px; color:#666;">From:</span> <strong style="font-size:14px;">${UI.formatDate(item.leave_start)}</strong></div>
          <div><span style="font-size:12px; color:#666;">To:</span> <strong style="font-size:14px;">${UI.formatDate(item.leave_end)}</strong></div>
          <div><span style="font-size:12px; color:#666;">Total Duration:</span> <span class="badge badge-warning" style="font-size:13px; font-weight:800;">${(function(it){ if (it.days !== undefined && it.days !== null && !isNaN(Number(it.days))) return Number(it.days); if (!it.leave_start || !it.leave_end) return 1; return Math.max(1, Math.ceil(Math.abs(new Date(it.leave_end) - new Date(it.leave_start)) / (1000 * 60 * 60 * 24)) + 1); })(item)} Day${((function(it){ if (it.days !== undefined && it.days !== null && !isNaN(Number(it.days))) return Number(it.days); if (!it.leave_start || !it.leave_end) return 1; return Math.max(1, Math.ceil(Math.abs(new Date(it.leave_end) - new Date(it.leave_start)) / (1000 * 60 * 60 * 24)) + 1); })(item)) > 1 ? 's' : ''}</span></div>
        </div>
      </div>

      ${item.note ? `
        <div style="margin-bottom:20px;">
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--color-text-muted); margin-bottom:4px;">Medical Leave Justification Note</div>
          <div style="font-size:13.5px; background:#FAFAFA; border:1px solid #E0E0E0; border-radius:6px; padding:10px 12px; color:#333;">${UI.escapeHtml(item.note)}</div>
        </div>
      ` : ''}

      <div style="display:flex; justify-content:space-between; align-items:flex-end; border-top:1px dashed var(--color-border, #CCC); padding-top:16px; margin-top:24px;">
        <div>
          <div style="font-size:11px; color:#888;">Attending Physician</div>
          <div style="font-size:14px; font-weight:700; color:#222;">${UI.escapeHtml(item.physician_name || 'Attending Clinic Physician')}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:11px; color:#888;">Issue Date</div>
          <div style="font-size:13px; font-weight:600;">${UI.formatDate(item.created_at || item.leave_start)}</div>
        </div>
      </div>

    </div>
  `;

  document.getElementById('sick-cert-modal-backdrop').classList.add('visible');
}

function closeSickCertModal() {
  document.getElementById('sick-cert-modal-backdrop').classList.remove('visible');
}

document.getElementById('sick-cert-modal-close').addEventListener('click', closeSickCertModal);
document.getElementById('sick-cert-modal-cancel').addEventListener('click', closeSickCertModal);
document.getElementById('sick-cert-modal-backdrop').addEventListener('click', (e) => {
  if (e.target.id === 'sick-cert-modal-backdrop') closeSickCertModal();
});

// Search and Filter Listeners
document.getElementById('staff-search-input').addEventListener('input', debounce(loadStaff, 250));
document.getElementById('dept-filter-select').addEventListener('change', loadStaff);
document.getElementById('sick-search-input').addEventListener('input', debounce(loadSickLeaves, 250));

async function init() {
  await loadUserInfo();
  await loadStaff();
}

init();
